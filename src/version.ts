// The version of the app (as package.json's, checked by npm run check), shown under the welcome window and in Help ▸
// About. Not the format of the project files (PROJECT_VERSION, src/project.ts).
export const APP_VERSION = '1.0.0';
// (as people say it: 1.0, 1.2, 1.2.1)
export const versionShown = APP_VERSION.replace(/\.0$/, '');
