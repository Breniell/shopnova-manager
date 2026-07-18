#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Version invalide dans package.json: ${version || '<vide>'}`);
}

const releaseDir = path.join(root, 'release');
const artifactName = `Legwan-Setup-${version}.exe`;
const artifactPath = path.join(releaseDir, artifactName);

if (!fs.existsSync(artifactPath)) {
  throw new Error(`${artifactName} est absent. Exécutez d'abord npm run dist:client.`);
}

const hash = await new Promise((resolve, reject) => {
  const digest = createHash('sha256');
  const stream = fs.createReadStream(artifactPath);
  stream.on('error', reject);
  stream.on('data', chunk => digest.update(chunk));
  stream.on('end', () => resolve(digest.digest('hex').toUpperCase()));
});

const kitName = `Legwan-${version}-INTERNE-NON-SIGNE`;
const kitDir = path.join(releaseDir, kitName);
fs.mkdirSync(kitDir, { recursive: true });
fs.copyFileSync(artifactPath, path.join(kitDir, artifactName));
fs.writeFileSync(
  path.join(kitDir, 'SHA256SUMS.txt'),
  `${hash}  ${artifactName}\n`,
  'utf8',
);

const instructions = `LEGWAN ${version} — KIT INTERNE NON SIGNÉ
================================================

Ce paquet est destiné uniquement aux PC pilotes contrôlés par votre entreprise.
Il n'est pas signé par un certificat Authenticode public.

1. Vérifiez que le fichier vient de votre source interne connue.
2. Dans PowerShell, depuis ce dossier, exécutez :

   Get-FileHash -Algorithm SHA256 -LiteralPath ".\\${artifactName}"

3. La valeur obtenue doit être exactement :

   ${hash}

4. Si Windows SmartScreen apparaît, ne le désactivez pas globalement. Après
   vérification de la somme, choisissez "Informations complémentaires", puis
   "Exécuter quand même".
5. Pour une boutique cloud, connectez le PC à Internet lors de la première
   connexion afin de charger les données. Coupez ensuite le réseau, redémarrez
   Legwan et testez une vente hors ligne avant la mise en service.
6. Conservez une sauvegarde Legwan récente sur un support séparé.

N'installez pas le fichier si la somme diffère.
`;

fs.writeFileSync(path.join(kitDir, 'LIRE-AVANT-INSTALLATION.txt'), instructions, 'utf8');

console.log(`Kit interne préparé : ${kitDir}`);
console.log(`SHA-256 : ${hash}`);
