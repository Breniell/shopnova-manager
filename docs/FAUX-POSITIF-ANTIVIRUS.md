# Déclarer Legwan en faux positif — Avast et Microsoft

Les démarches sont **gratuites**. Elles ne remplacent pas un certificat de
signature.

**Une seule est à faire aujourd'hui : celle d'Avast.** C'est le blocage réel,
prouvé par ses propres journaux. La démarche Microsoft n'a pas lieu d'être tant
qu'aucun client n'a signalé de détection Defender — voir la section 2, qui
explique pourquoi et à quelle condition elle deviendra utile.

Compter quelques jours de traitement. Le formulaire demande le fichier
lui-même, ce qui oblige à passer par un navigateur : il n'existe pas d'API
publique utilisable sans compte.

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
- **Detection name** : `Autosandbox / CyberCapture - no signature detection`
- **Alert ID** : `N/A`

Ces deux derniers champs n'ont pas de vraie valeur, et il ne faut rien inventer :
Avast ne **détecte** pas Legwan, il l'**isole**. Vérifié le 18/09/2026 dans ses
propres journaux (`event_manager.log`, `AvastSvc.log`, `ashshell.log`) : aucune
détection nommée, aucune signature. Seul `autosandbox.log` réagit, et son
mécanisme ne produit ni nom de menace ni identifiant d'alerte. Un faux nom de
détection ferait rejeter ou mal router la demande.

Sur la machine du développeur, le blocage **n'est plus reproductible** — le
journal indique `Not sandboxing (because the file is in the exception list)`
depuis que Legwan y a été mis en exception. Capturer une vraie alerte
demanderait une machine vierge ; ce n'est pas nécessaire pour la soumission.

Description à coller :

> Legwan is a point-of-sale application for small retailers in Cameroon and
> French-speaking Africa. The installer is a standard Electron/NSIS package
> built with electron-builder.
>
> There is no named detection: Avast does not flag the file as malware, it
> auto-sandboxes it. Our autosandbox.log reads "Autosandbox candidate:
> Legwan-Setup.exe --> Result: Sandboxing (custody processed with result
> Terminate)", so setup is killed part-way and the customer sees only a
> generic Windows path error. We believe the sole cause is that the binary is
> not code-signed yet.
>
> Behaviour for reference: no network activity beyond Firebase Firestore
> synchronisation and GitHub release checks for automatic updates; per-user
> installation under %LOCALAPPDATA%, no elevation requested.
>
> This blocks legitimate customers from installing the software. Source
> repository and published checksums:
> https://github.com/Breniell/shopnova-manager

---

## 2. Microsoft — à ne PAS soumettre pour l'instant

Portail : <https://www.microsoft.com/en-us/wdsi/filesubmission>

**Ce formulaire ne s'applique pas aujourd'hui.** Il sert à faire corriger une
**détection** de Defender, et son champ **Detection name** est obligatoire. Or
il n'y a aucune détection à corriger :

- `Get-MpThreatDetection` et `Get-MpThreat` ne renvoient rien — l'historique de
  Defender est vide (vérifié le 18/09/2026) ;
- Defender est de toute façon **désactivé** sur la machine de développement,
  Avast s'étant enregistré comme antivirus actif (`Get-MpComputerStatus` :
  `AntivirusEnabled = False`). Il n'a donc jamais analysé Legwan.

Une soumission avec un nom de détection inventé serait close en
« no detection reproduced », et aurait coûté le téléversement de 95 Mo pour
rien.

**Le vrai problème Microsoft n'est pas Defender, c'est SmartScreen** —
l'avertissement « Windows a protégé votre ordinateur » au téléchargement. Il
repose sur la **réputation** du fichier, pas sur une signature de menace, et ce
formulaire ne le traite pas. La réputation se construit par le volume de
téléchargements et, beaucoup plus vite, par la signature de code.

### Quand ce formulaire deviendra le bon outil

Le jour où **un client signale que Defender a bloqué Legwan** avec un nom de
menace. Les applications Electron non signées déclenchent régulièrement des
faux positifs heuristiques du type `Trojan:Win32/Wacatac.B!ml`.

Demander alors au client :

> Sécurité Windows > Protection contre les virus et menaces > Historique de
> protection > ouvrir la ligne concernant Legwan.

Relever le **nom exact de la menace** et la **version des définitions**
(Paramètres > Protection contre les virus > Mises à jour de la protection).
Avec ces deux valeurs, la soumission devient légitime et utile.

Champs à remplir ce jour-là :

| Champ | Valeur |
|---|---|
| Security product | Microsoft Defender Antivirus |
| Company Name | Legwan |
| Support case number | No |
| File | `release\Legwan-Setup-1.8.0.exe` |
| Remove from database | *No — remove automatically after inactivity* |
| What do you believe this file is | *Incorrectly detected as malware/malicious* |
| Detection name | le nom relevé chez le client |
| Definition version | celle relevée chez le client |

Description à coller :

> Point-of-sale desktop application for small retailers in Cameroon and
> French-speaking Africa, distributed as an unsigned Electron/NSIS installer
> built with electron-builder. Per-user installation under %LOCALAPPDATA%, no
> elevation requested. Network activity limited to Firebase Firestore
> synchronisation and GitHub Releases update checks.
>
> A customer running Microsoft Defender reports the detection named above on
> this installer. We believe it is a heuristic false positive on an unsigned
> Electron binary. Published SHA-256 checksums and full source:
> https://github.com/Breniell/shopnova-manager

---

## En attendant la réponse

Ces deux démarches ne sont pas instantanées. D'ici là, la marche à suivre pour
un client bloqué figure déjà dans les notes de version : ajouter le fichier en
exception (Avast > Menu > Paramètres > Général > Exceptions), après avoir
vérifié son empreinte SHA-256 publiée avec la release.

La mise à jour automatique fonctionne depuis la 1.7.5 : le problème ne se pose
donc qu'à la **première** installation, pas aux suivantes.
