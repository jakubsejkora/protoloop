/* eslint-disable */
// afterSign hook: notarize the .app only when Apple Developer credentials are
// present in the environment. Without them, packaging still produces a working
// (unsigned / ad-hoc) local build.
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      '[notarize] Skipping notarization — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID to enable it.'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  console.log(`[notarize] Notarizing ${appName}.app …`)
  await notarize({
    appBundleId: 'com.protoloop.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log('[notarize] Done.')
}
