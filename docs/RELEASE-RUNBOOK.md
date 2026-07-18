# Publication, recette hors ligne et retour arrière

## Prérequis externes

Une publication publique est volontairement impossible sans ces éléments :

- un certificat Authenticode Windows valide (`WIN_CSC_LINK`, contenu PFX en base64 ou chemin/URL accepté par electron-builder) ;
- son mot de passe dans `WIN_CSC_KEY_PASSWORD` si le PFX est protégé ;
- le nom exact de l'éditeur du certificat dans `WIN_CSC_PUBLISHER`, utilisé par electron-updater pour refuser une autre identité ;
- facultativement, une partie stable du sujet du certificat dans `WIN_CSC_SUBJECT` pour détecter un certificat inattendu ;
- les sept variables Firebase/Vite et `VITE_LICENSE_PUBKEY` dans les secrets GitHub ;
- les règles `firestore.rules` déployées séparément sur le bon projet Firebase.

Ne jamais ajouter un PFX, une clé privée, `.env` ou `service-account.json` au dépôt.

## Construction

Paquet local non signé, réservé aux contrôles internes :

```powershell
npm run dist:client
```

Publication signée stricte :

```powershell
$env:CSC_LINK = '<PFX base64, chemin ou URL>'
$env:CSC_KEY_PASSWORD = '<mot de passe>'
$env:WIN_CSC_PUBLISHER = '<éditeur exact du certificat>'
$env:WIN_CSC_SUBJECT = '<sujet attendu>'
npm run release:client
```

Le build public échoue si le certificat manque, si Authenticode n'est pas valide, si `latest.yml` ne correspond pas à l'installateur, si l'archive contient un secret ou si les fichiers `asar` attendus manquent. Le fichier `release/SHA256SUMS.txt` est généré après ces contrôles.

La CI GitHub exécute le même chemin strict et publie l'installateur, son blockmap, `latest.yml` et la somme SHA-256.

## Recette automatisable

Après un build Vite :

```powershell
npm run electron:build:client
npm run smoke:offline
```

Après empaquetage :

```powershell
npm run smoke:offline:packaged
```

Le test lance Electron avec un profil neuf et l'émulation réseau Chromium en mode hors ligne. Il vérifie que le fournisseur de données a libéré l'interface et qu'un écran applicatif est monté. Il ne remplace pas la recette sur PC physique : démarrage après coupure Wi-Fi/câble, redémarrage Windows, ventes et impressions réelles restent obligatoires.

## Sauvegardes automatiques et diagnostics

Quand l'interface est prête, l'application crée au plus une sauvegarde complète par jour et conserve les 14 plus récentes. Une sauvegarde forcée est exigée juste avant l'installation explicite d'une mise à jour ; en cas d'échec ou de délai dépassé, l'installation est bloquée.

Les fichiers sont des sauvegardes Legwan JSON importables depuis les paramètres. Ils se trouvent dans le profil utilisateur Electron, sous `automatic-backups`. Le menu **Legwan > Sauvegardes automatiques** ouvre le dossier exact.

Les journaux locaux sont limités et tournants. Les tokens, clés Firebase, mots de passe, PIN et paramètres d'URL sensibles sont masqués avant écriture. Le menu **Legwan > Diagnostics locaux** ouvre leur emplacement. Les journaux ne doivent malgré tout pas être publiés sans contrôle humain.

## Déploiement progressif

1. Conserver hors ligne l'installateur signé de la version précédente et sa somme SHA-256.
2. Publier d'abord pour une boutique pilote.
3. Vérifier ouverture en ligne/hors ligne, synchronisation, impression et restauration d'une copie de sauvegarde.
4. Étendre par petits groupes uniquement après validation du pilote.

## Retour arrière contrôlé

Electron-updater ne doit pas être utilisé pour forcer une baisse de version. En cas d'incident :

1. arrêter la diffusion de la release concernée (la passer en brouillon ou la retirer des releases GitHub) ;
2. quitter Legwan et copier le dossier `automatic-backups` sur un support séparé ;
3. vérifier la signature et la somme du dernier installateur stable conservé ;
4. désinstaller la version fautive sans effacer le profil utilisateur ;
5. réinstaller la version stable signée et effectuer la recette hors ligne ;
6. si les données ne sont pas compatibles, restaurer depuis la sauvegarde `pre-update` via **Paramètres > Sauvegarde** ;
7. publier ensuite un correctif avec un numéro de version supérieur pour rétablir le canal normal de mise à jour.

Une modification destructive de schéma doit fournir sa propre migration inverse avant publication. La sauvegarde pré-update protège les données, mais ne rend pas automatiquement un ancien binaire compatible avec un nouveau schéma.
