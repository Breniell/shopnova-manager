; NSIS hooks — Legwan Admin (installeur éditeur)
; Répertoire distinct de la variante client pour coexistence sur la même machine.

!macro customInstallDir
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Legwan Admin"
!macroend

!macro customInit
  SetShellVarContext current
!macroend
