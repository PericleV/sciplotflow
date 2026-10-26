# Export a ViT-Tiny Segment Anything (MobileSAM, or micro-sam's vit_t_em_organelles) to two ONNX files for the browser:
#   encoder: image [1, 3, 1024, 1024] (normalized, padded) -> embeddings [1, 256, 64, 64]
#   decoder: embeddings, point_coords [B, N, 2] (1024 frame), point_labels [B, N] -> masks [B, 4, 256, 256] (logits),
#            iou [B, 4]  (mask 0: the single-mask output, 1..3: the multimask outputs)
# Then checks ONNX against PyTorch, and (micro-sam) the reference of its Zenodo record (its image and embeddings).
# Needs: torch (CPU), onnx, onnxruntime, timm, numpy and MobileSAM (pip install git+https://github.com/ChaoningZhang/MobileSAM).
# The files of public/models were made with:
#   python -I export-sam.py mobile_sam.pt mobilesam            (weights/mobile_sam.pt of the MobileSAM repository)
#   python -I export-sam.py vit_t.pt microsam_em <its folder>  (vit_t.pt of Zenodo 10.5281/zenodo.11110950, with its
#                                                              input.npy and embeddings.npy)
# then renamed mobilesam-encoder.onnx, mobilesam-decoder.onnx, microsam-em-tiny-encoder.onnx, … (torch 2.14, opset 17).
# (The encoder against PyTorch is compared on an image or noise in a fresh process: computed after the export, in the
# same process, PyTorch's result differs.)
# Usage: python -I export-sam.py <checkpoint.pt> <out_prefix> [<reference dir>]
import sys
import warnings

import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as F

warnings.simplefilter('ignore')
from mobile_sam import sam_model_registry  # noqa: E402

ckpt, out = sys.argv[1], sys.argv[2]
ref = sys.argv[3] if len(sys.argv) > 3 else None

state = torch.load(ckpt, map_location='cpu', weights_only=True)
if isinstance(state, dict) and 'model' in state and not any(k.startswith('image_encoder') for k in state):
    state = state['model']
sam = sam_model_registry['vit_t']()
missing, unexpected = sam.load_state_dict(state, strict=False)
print('missing', len(missing), missing[:5], 'unexpected', len(unexpected), unexpected[:5])
assert not missing, 'weights missing'
sam.eval()


class Encoder(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.enc = m.image_encoder

    def forward(self, x):
        return self.enc(x)


class Decoder(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, image_embeddings, point_coords, point_labels):
        pe = self.m.prompt_encoder
        c = (point_coords + 0.5) / 1024.0
        emb = pe.pe_layer._pe_encoding(c)
        lab = point_labels.unsqueeze(-1).expand_as(emb)
        emb = emb * (lab != -1)
        emb = emb + pe.not_a_point_embed.weight * (lab == -1)
        for i in range(pe.num_point_embeddings):
            emb = emb + pe.point_embeddings[i].weight * (lab == i)
        dense = pe.no_mask_embed.weight.reshape(1, -1, 1, 1).expand(1, -1, 64, 64)
        masks, iou = self.m.mask_decoder.predict_masks(image_embeddings=image_embeddings, image_pe=pe.get_dense_pe(), sparse_prompt_embeddings=emb, dense_prompt_embeddings=dense)
        return masks, iou


enc, dec = Encoder(sam), Decoder(sam)
x = torch.randn(1, 3, 1024, 1024)
with torch.no_grad():
    torch.onnx.export(enc, (x,), f'{out}_encoder.onnx', input_names=['image'], output_names=['embeddings'], opset_version=17, dynamo=False)
    e = enc(x)
    pc = torch.tensor([[[400.0, 300.0], [0.0, 0.0]], [[100.0, 700.0], [0.0, 0.0]]])
    pl = torch.tensor([[1.0, -1.0], [1.0, -1.0]])
    torch.onnx.export(dec, (e, pc, pl), f'{out}_decoder.onnx', input_names=['embeddings', 'point_coords', 'point_labels'], output_names=['masks', 'iou'],
                      dynamic_axes={'point_coords': {0: 'B', 1: 'N'}, 'point_labels': {0: 'B', 1: 'N'}, 'masks': {0: 'B'}, 'iou': {0: 'B'}}, opset_version=17, dynamo=False)

# ---- ONNX against PyTorch ----
se = ort.InferenceSession(f'{out}_encoder.onnx')
sd = ort.InferenceSession(f'{out}_decoder.onnx')
eo = se.run(None, {'image': x.numpy()})[0]
print('encoder max |onnx - torch|', float(np.abs(eo - e.numpy()).max()), 'scale', float(np.abs(e.numpy()).max()))
for pcs, pls in [(pc, pl), (torch.tensor([[[512.0, 512.0], [600.0, 500.0], [0, 0]]]), torch.tensor([[1.0, 0.0, -1.0]])), (torch.tensor([[[100.0, 100.0], [300.0, 260.0]]]), torch.tensor([[2.0, 3.0]]))]:
    with torch.no_grad():
        mt, it = dec(e, pcs, pls)
    mo, io = sd.run(None, {'embeddings': e.numpy(), 'point_coords': pcs.numpy(), 'point_labels': pls.numpy()})
    print('decoder B', pcs.shape[0], 'N', pcs.shape[1], 'masks', float(np.abs(mo - mt.numpy()).max()), 'iou', float(np.abs(io - it.numpy()).max()))
# the decoder against Sam's own prompt encoder (a point, with its padding point, as SamPredictor does)
with torch.no_grad():
    sp, de = sam.prompt_encoder(points=(torch.tensor([[[400.0, 300.0]]]), torch.tensor([[1]])), boxes=None, masks=None)
    m0, i0 = sam.mask_decoder.predict_masks(e, sam.prompt_encoder.get_dense_pe(), sp, de)
    m1, i1 = dec(e, torch.tensor([[[400.0, 300.0], [0.0, 0.0]]]), torch.tensor([[1.0, -1.0]]))
print('as SamPredictor: masks', float((m0 - m1).abs().max()), 'iou', float((i0 - i1).abs().max()))

# ---- the reference of the Zenodo record: its image, embeddings, prompts and masks ----
if ref:
    img = np.load(f'{ref}/input.npy')
    emb_ref = np.load(f'{ref}/embeddings.npy')
    print('input', img.shape, img.dtype, float(img.min()), float(img.max()), 'embeddings', emb_ref.shape)
    t = torch.from_numpy(img.astype(np.float32))
    if t.ndim == 3:
        t = t[None]
    if t.shape[1] == 1:
        t = t.repeat(1, 3, 1, 1)
    h, w = t.shape[2:]
    s = 1024 / max(h, w)
    nh, nw = int(h * s + 0.5), int(w * s + 0.5)
    # (as SamPredictor's apply_image_torch: bilinear, antialiased)
    r = F.interpolate(t, (nh, nw), mode='bilinear', align_corners=False, antialias=True)
    mean = torch.tensor([123.675, 116.28, 103.53]).view(1, 3, 1, 1)
    std = torch.tensor([58.395, 57.12, 57.375]).view(1, 3, 1, 1)
    r = F.pad((r - mean) / std, (0, 1024 - nw, 0, 1024 - nh))
    eo = se.run(None, {'image': r.numpy()})[0]
    d = np.abs(eo - emb_ref)
    print('reference embeddings: max', float(d.max()), 'mean', float(d.mean()), 'scale', float(np.abs(emb_ref).max()))
    pts = np.load(f'{ref}/point_prompts.npy')
    lbs = np.load(f'{ref}/point_labels.npy')
    mref = np.load(f'{ref}/mask.npy')
    print('prompts', pts.shape, lbs.shape, 'masks', mref.shape, mref.dtype)
