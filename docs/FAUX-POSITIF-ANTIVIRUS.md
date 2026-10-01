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
| Fichier à téléverser | `release\Legwan-Setup-1.13.0.exe` |
| Taille | 99 250 821 octets (94,7 Mo) |
| SHA-256 | `d2de44e3688088005b14bf8ba2b274029bf39d63052d3ff11547e2493a4f013a` |
| Nom du produit | Legwan |
| Version | 1.13.0 |
| Éditeur | Legwan |
| Contact | support@legwan.cm |
| URL de téléchargement | https://github.com/Breniell/shopnova-manager/releases/latest |

Vérifier l'empreinte avant l'envoi, pour être certain de soumettre le fichier
réellement distribué :

```powershell
Get-FileHash release\Legwan-Setup-1.13.0.exe -Algorithm SHA256
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

### Le blocage est reproductible, et il a un coût mesuré (01/10/2026)

L'affirmation précédente — « le blocage n'est plus reproductible sur la machine
du développeur » — était fausse. L'exception ajoutée ne couvrait que
`Legwan.exe`, le binaire installé. Elle ne couvre **ni l'installeur téléchargé,
ni le désinstalleur temporaire**, et ce sont eux qui bloquent.

`autosandbox.log` sur la machine de développement, du 02/06/2026 au 01/10/2026 :
**toutes** les versions de Legwan, et tous les `old-uninstaller.exe`, portent le
verdict `Sandboxing`. Aucune exception, sur quatre mois.

Le 01/10/2026 à 12:09, une mise à jour silencieuse s'est **interbloquée
définitivement** :

```
01/10/2026 12:09:43  Autosandbox candidate: ...\Temp\nso7CCF.tmp\old-uninstaller.exe
  [Source: local://*...\legwan-manager-updater\pending\Legwan-Setup-1.13.0.exe]
  --> Result: Sandboxing
```

Les deux processus `old-uninstaller.exe` lancés sont restés à l'état
`Initialized`, 0 seconde de CPU : créés, jamais exécutés. L'installeur les
attendait sur un `ExecWait` sans délai maximum
(`app-builder-lib/templates/nsis/include/installUtil.nsh:224`). Au bout de trois
minutes, rien n'avait avancé. En arrêtant les processus, le désinstalleur s'est
exécuté et a **vidé le dossier d'installation sans que le nouvel installeur
puisse écrire** : application détruite, à réinstaller à la main. Les données
utilisateur ont survécu (`/KEEP_APP_DATA`).

C'est le dommage concret à décrire dans la soumission : pas un fichier bloqué au
téléchargement, mais une application effacée chez un commerçant.

Description à coller :

> Legwan is a point-of-sale application for small retailers in Cameroon and
> French-speaking Africa. The installer is a standard Electron/NSIS package
> built with electron-builder.
>
> There is no named detection: Avast does not flag the file as malware, it
> auto-sandboxes it. Every Legwan build since June 2026 is logged in our
> autosandbox.log as "Result: Sandboxing", with no exception.
>
> This now destroys installations rather than merely delaying them. On
> 2026-10-01 at 12:09 an in-app update sandboxed the temporary uninstaller
> that electron-builder's NSIS installer runs to remove the previous version
> ("Autosandbox candidate: ...\Temp\nso7CCF.tmp\old-uninstaller.exe -->
> Result: Sandboxing"). The process was created but never executed: 0 seconds
> of CPU, state Initialized. The parent installer waits on it with ExecWait,
> which has no timeout, so the update deadlocked indefinitely with the
> application already closed. When the stalled processes were terminated, the
> uninstaller ran and emptied the installation directory while the new
> installer was no longer able to write to it. The application was gone and
> had to be reinstalled by hand.
>
> For a shopkeeper this means a till that closes for an update and never
> reopens. We believe the sole cause is that the binary is not code-signed.
>
> Behaviour for reference: no network activity beyond Firebase Firestore
> synchronisation and GitHub release checks for automatic updates; per-user
> installation under %LOCALAPPDATA%, no elevation requested.
>
> Source repository and published checksums:
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

Ces deux démarches ne sont pas instantanées. D'ici là, l'exception Avast doit
couvrir **trois** emplacements, pas seulement l'application installée — c'est
l'erreur commise sur la machine de développement, où seule la première ligne
était déclarée et où les mises à jour ont continué d'être mises en bac à sable
pendant quatre mois :

| Chemin | Ce qu'il protège |
|---|---|
| `%LOCALAPPDATA%\Programs\Legwan\` | l'application installée |
| `%LOCALAPPDATA%\legwan-manager-updater\pending\` | l'installeur téléchargé par la mise à jour |
| `%TEMP%\ns*.tmp\` | le désinstalleur temporaire — **celui qui interbloque** |

Avast > Menu > Paramètres > Général > Exceptions, en acceptant les jokers.

**L'affirmation « le problème ne se pose qu'à la première installation » était
fausse** et figurait ici jusqu'au 01/10/2026. Le journal d'Avast montre que
chaque mise à jour passe par le bac à sable, à l'installeur **et** au
désinstalleur. Le risque n'a jamais cessé après la première installation : il
s'est seulement vu moins, parce que le bac à sable relâche généralement le
processus assez vite. Généralement.
