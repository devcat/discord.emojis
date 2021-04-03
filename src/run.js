const { get } = require('https');
const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');

async function main() {
  const old = readFileSync('./dist/emojis.json').toString();
  const prev = JSON.parse(readFileSync('./dist/metadata.json').toString());
  const discord_html = await fetch('https://canary.discord.com/channels/@me');

  const updated = await find(old, prev.hash, discord_html.toString());
  
  if (null === updated) (console.log('no changes'), process.exit(0));
  if (updated === undefined) (console.log('couldn\'t find asset with emojis'), process.exit(1));

  execSync('git config --local user.name "github-actions[bot]"');
  writeFileSync('.npmrc', `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`);
  execSync('git config --local user.email "github-actions[bot]@users.noreply.github.com"');

  execSync('git commit -m "update emojis" -a');

  execSync('npm version patch');
  execSync('npm publish --access=public');
  execSync(`git push https://${process.env.ACTOR}:${process.env.GITHUB_TOKEN}@github.com/devcat/discord.emojis.git HEAD:master`);
}

main();

function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, response => {
      const chunks = [];
      response.once('error', reject);
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => resolve(Buffer.concat(chunks)));
    }).end();
  });
}

const JS_ASSET = /assets\/([\d\w]+.js)/g;
const INLINED_EMOJIS_JSON = /JSON.parse\('({"people":[^']+})'\)}/;

async function find(old, hash, html) {
  console.log('old asset', hash);

  for (const [, asset] of html.matchAll(JS_ASSET)) {
    console.log('new asset', asset);
    if (hash === asset) return null;
    html = await fetch(`https://canary.discord.com/assets/${asset}`);

    html = html.toString();
    const g = html.match(INLINED_EMOJIS_JSON);

    if (!g) continue;
    if (old === g[1]) return null;
    const emojis = JSON.parse(g[1]);

    const kv = {};
    for (const cat in emojis) {
      for (const emoji of emojis[cat]) {
        for (const name of emoji.names) kv[name] = emoji.surrogates;
      }
    }

    console.log(new Set(Object.values(kv)).size - new Set(Object.values(JSON.parse(readFileSync('./dist/kv.json')))).size, 'new emojis');

    writeFileSync('./dist/kv.json', JSON.stringify(kv));
    writeFileSync('./dist/emojis.json', JSON.stringify(emojis));
    writeFileSync('./dist/metadata.json', JSON.stringify({ hash: asset }));

    return true;
  }
}
