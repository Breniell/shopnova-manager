# Déclarer Legwan en faux positif — Avast et Microsoft

Les deux démarches sont **gratuites**. Elles ne remplacent pas un certificat de
signature, mais elles retirent le blocage chez les deux moteurs qui touchent le
plus de machines au Cameroun : Avast (très répandu en boutique) et Windows
Defender / SmartScreen (présent sur toutes les machines).

Compter quelques jours de traitement chez chacun. Les deux formulaires
demandent le fichier lui-même, ce qui oblige à passer par un navigateur — il
n'existe pas d'API publique utilisable sans compte.

**À refaire à chaque version publiée.** L'analyse porte sur une empreinte de
fichier précise, et chaque version est un fichier différent — donc de nouveau
inconnu des deux moteurs, quelle que soit la réponse obtenue pour la
précédente.

---

## Les informations à saisir

Elles sont identiques pour les deux formulaires.

| Champ | Valeur |
|---|---|
| Fichier à téléverser | `release\Legwan-Setup-1.8.0.exe` |
| Taille | 99 235 473 octets (94,6 Mo) |
| SHA-256 | `8245060aeb525ca9855588d130ebc231524a571071ddd91970ac940e315c6d9d` |
| Nom du produit | Legwan |
| Version | 1.8.0 |
| Éditeur | Legwan |
| Contact | support@legwan.cm |
| URL de téléchargement | https://github.com/Breniell/shopnova-manager/releases/latest |

Vérifier l'empreinte avant l'envoi, pour être certain de soumettre le fichier
réellement distribué :

```powershell
Get-FileHash release\Legwan-Setup-1.8.0.exe -Algorithm SHA256
```

Elle doit correspondre au `SHA256SUMS.txt` publié avec la release.

### Régénérer ce tableau pour une version ultérieure

Cette commande imprime les trois valeurs à reporter ci-dessus :

```powershell
$f = Get-ChildItem release\Legwan-Setup-*.exe |
     Sort-Object LastWriteTime -Descending | Select-Object -First 1
$f.Name
"$($f.Length) octets"
(Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
```

---

## 1. Avast

Formulaire : <https://www.avast.com/false-positive-file-form.php>

- **Type de soumission** : *File is incorrectly detected* (fichier détecté à tort)
- **Email** : support@legwan.cm
- **Fichier** : l'installeur ci-dessus

Description à coller :

> Legwan is a point-of-sale application for small retailers in Cameroon and
> French-speaking Africa. The installer is a standard Electron/NSIS package
> built with electron-builder. It is not code-signed yet, which we believe is
> the sole reason for the detection: the file has no network behaviour beyond
> Firebase Firestore synchronisation and GitHub release checks for automatic
> updates, and it installs per-user under %LOCALAPPDATA% without elevation.
>
> Avast currently terminates the installer during setup, which prevents
> legitimate customers from installing the software. Source repository and
> published checksums: https://github.com/Breniell/shopnova-manager

---

## 2. Microsoft (Defender et SmartScreen)

Portail : <https://www.microsoft.com/en-us/wdsi/filesubmission>

- Choisir **Software developer** puis *Submit a file for malware analysis*
- Une connexion avec un compte Microsoft est demandée (gratuite)
- **Detection name** : laisser vide si Defender ne signale rien — la soumission
  sert alors à établir la réputation du fichier, ce qui réduit l'avertissement
  SmartScreen au téléchargement
- Cocher **Incorrectly detected as malware**

Description à coller :

> Point-of-sale desktop application for small retailers, distributed as an
> unsigned Electron/NSIS installer. Per-user installation, no elevation
> required. Network activity limited to Firebase Firestore and GitHub Releases.
> Requesting reputation review so that SmartScreen stops warning end users on
> download. Published checksums and source:
> https://github.com/Breniell/shopnova-manager

---

## En attendant la réponse

Ces deux démarches ne sont pas instantanées. D'ici là, la marche à suivre pour
un client bloqué figure déjà dans les notes de version : ajouter le fichier en
exception (Avast > Menu > Paramètres > Général > Exceptions), après avoir
vérifié son empreinte SHA-256 publiée avec la release.

La mise à jour automatique fonctionne depuis la 1.7.5 : le problème ne se pose
donc qu'à la **première** installation, pas aux suivantes.
