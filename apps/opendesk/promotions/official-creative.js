(function installOpenDeskOfficialPromotionCreative(root) {
  'use strict';

  // Bundled first-party raster only. This is deliberately local and immutable:
  // the first production surface does not fetch remote HTML, scripts, SVG, or
  // third-party ad SDK content.
  const poster='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKgAAABaAgMAAABRf/U1AAAACVBMVEWx1f8jO1UNHC/u0/2eAAACd0lEQVR42u2XMU/bQBTHf76CFVkdGJoqE2KqIvgIZaCfoEigyGKIbswnqBBD9JRPkdETQiFIGbq1Qz4Ck5Uxo1WWDOgUGTh3cOw7QJVgQlTxYN/z/e7une+9u7+DES+9FGv07VGrjU67faNNnFqLCDEp8zmppF3RRhyaD9UwSlBDdTGSHLDnjEQg0lECf7RDs7AshoBkVshVX2gBLYCktUI3Kk90fQOgn2cAdFXyaFq2ZwSw+rPIo6a1nzWqkkjKB5KX7+UcIHqCtnKAFjmULoZ2UCIZ5OjMoWEPjMb2bNyRENLBCekZRpvE6B0+V84GT7Ng2XjxajXW8bpG/3ltgI1ra1e4rI3NQ26mlREco2DmGs64c8YdRU1STF/pq5c/loVXN733jMV6td4dqthVo/bOSAAW95e/JovL3/cAxfhuPJ2O78bVrt0wMZ023SXAR5r73Db3y56OHo6nxdHDcdWrHfSfjfbh1pUD50ALhLyquH3aKpg6NCKSi7o7boqf3ATXAFwVE9grJhVqEoNLGprBPs1V+XtwCJ+CQ3fCDMBWEX4NW37qUXgfS/OFkZuDyz2gGO99uyrGq7Og49WMfK75dYKXv+sgfGeo+NaWV3ew4Rlbr+y17aw2m16AEBy4VDh4rjLWq/UG6Mwg8iM2Ou3GJu6cpl1i28dIKp1Tq83S2koTzrYbA3vWWJJtkzeWhAAymK9ksVW2oZwDOn80VK6kEs5ZCEpqUZrlzx1zUlpJ5gtomVtte0ZOrPZws1KuxhfQwx2VqNNILpwI9+RzpGs0KYX+Ts2EVlor4dzK8f4LFBmqH5cqOgZQJ7ASzmEPknKz/E9D+y/G2uaAMi2QgQAAAABJRU5ErkJggg==';

  function create() {
    return {
      schemaVersion: 2,
      id: 'officialAutomationIntro',
      campaignId: 'officialAutomationIntro2026',
      advertiser: 'OpenDesk 官方',
      presentation: 'image',
      title: '重复的操作，交给自动化。',
      description: '从一次操作，到可验证、可重复运行的自动化。',
      cta: '定制自动化',
      action: {kind: 'official', id: 'opendesk.customize'},
      media: {
        kind: 'image',
        src: poster,
        alt: 'OpenDesk 官方推广：从一次操作到可验证、可重复运行的自动化',
      },
    };
  }

  const api=Object.freeze({create,poster});
  root.OpenDeskOfficialPromotionCreative=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
