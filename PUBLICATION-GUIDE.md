# Guide de Publication v1.3.2 sur GitHub

## ✅ Étapes Complétées

Les éléments suivants ont été finalisés localement :

1. **Tag Git créé** : `v1.3.2`
2. **Commits poussés** : Tous les changements sont sur GitHub (main branch)
   - Version package.json : 1.3.2 ✓
   - Version PolicyGate.tsx : 1.3.2 ✓
   - Commits poussés vers origin/main ✓

3. **Build Electron finalisé**
   - Installer généré : `Legwan Setup 1.3.2.exe`
   - Blockmap généré : `Legwan Setup 1.3.2.exe.blockmap`
   - latest.yml généré : Configuration auto-update
   - Tous les fichiers dans : `d:\Shopnova\shopnova-manager\release\`

## 📋 Prochaine Étape : Créer la Release sur GitHub

### Option 1 : Via l'Interface Web GitHub (Recommandé)

1. Allez sur : https://github.com/Breniell/shopnova-manager/releases/new
2. Remplissez le formulaire :
   - **Tag version** : `v1.3.2` (sélectionner depuis la liste)
   - **Release title** : `v1.3.2 - Legwan Complete POS`
   - **Description** : Copier le contenu de `release/v1.3.2-release-notes.md`
3. Téléversez les assets (drag & drop) :
   - `Legwan Setup 1.3.2.exe`
   - `Legwan Setup 1.3.2.exe.blockmap`
   - `latest.yml`
4. Cliquez "Publish release"

### Option 2 : Via Script PowerShell

Si vous avez un GitHub Token personnel :

```powershell
$token = "ghp_YOUR_TOKEN_HERE"
d:\Shopnova\shopnova-manager\scripts\create-github-release.ps1 -GitHubToken $token
```

Pour créer un token : https://github.com/settings/tokens/new
- Permissions requises : `repo`, `write:packages`

### Option 3 : Via GitHub CLI (gh)

```bash
gh release create v1.3.2 --title "v1.3.2 - Legwan Complete POS" --notes-file release/v1.3.2-release-notes.md release/Legwan\ Setup\ 1.3.2.exe release/Legwan\ Setup\ 1.3.2.exe.blockmap release/latest.yml
```

## 🔍 Vérification Post-Publication

Après création de la release :

1. **GitHub Release Page**
   - [ ] Release visible sur https://github.com/Breniell/shopnova-manager/releases
   - [ ] Assets téléchargeables

2. **Auto-Update**
   - [ ] Vérifier que `latest.yml` contient la version 1.3.2
   - [ ] Télécharger l'exe et vérifier la version en Properties

3. **Continuité des Mises à Jour**
   - Les utilisateurs avec v1.3.1 recevront une notification
   - Les utilisateurs avec versions antérieures verront la notification

## 📊 État des Releases

| Version | Status | Assets | Notes |
|---------|--------|--------|-------|
| v1.0.0 | ✓ Published | 6 files | Initial release |
| v1.3.2 | ⏳ Pending | Ready | Tag poussé, assets prêts |

## 🔄 Versions Manquantes sur GitHub

Les versions suivantes existent en local mais ne sont pas encore publiées sur GitHub :
- v1.1
- v1.1.2
- v1.1.3
- v1.2.1
- v1.2.2

Ces versions pourraient être ajoutées ultérieurement pour une traçabilité complète.

## 📝 Checklist Finale

- [x] Code versiono 1.3.2 en local
- [x] Tests passants (441/441)
- [x] Electron build complété
- [x] Installer signé généré
- [x] PolicyGate synchronisé
- [x] Commits poussés sur GitHub
- [x] Tag v1.3.2 créé et poussé
- [ ] **GitHub Release v1.3.2 publiée** ← À faire

---

**Prochaine action** : Publier la release v1.3.2 sur GitHub via l'une des trois méthodes ci-dessus.
