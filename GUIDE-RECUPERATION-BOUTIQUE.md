# Recuperation d'une boutique Legwan

## Principe

Legwan garde les donnees cloud dans Firebase sous `boutiques/{boutiqueId}`.
Le `boutiqueId` est le UID Firebase Auth de la boutique.

Au premier lancement, l'application cree encore un utilisateur Firebase anonyme. Pour rendre la boutique recuperable sur une autre machine, le gerant doit lier cette boutique a un compte Email/Password depuis :

`Parametres > Boutique > Sauvegarde et recuperation cloud`

Cette action transforme le compte anonyme en compte restaurable sans changer le UID. Les donnees deja existantes restent donc au meme endroit dans Firestore.

## Configuration Firebase obligatoire

Dans Firebase Console, activez ces fournisseurs :

- Authentication > Sign-in method > Anonymous
- Authentication > Sign-in method > Email/Password

Les regles Firestore restent basees sur `request.auth.uid == boutiqueId`, donc une boutique ne peut lire/ecrire que son propre espace.

## Procedure pour le commercant

1. Ouvrir Legwan sur la machine actuelle.
2. Se connecter comme gerant.
3. Aller dans `Parametres > Boutique`.
4. Dans `Sauvegarde et recuperation cloud`, saisir un email proprietaire et un mot de passe.
5. Cliquer sur `Activer la recuperation`.
6. Conserver l'email et le mot de passe dans un endroit fiable.

## Procedure apres perte ou remplacement de machine

1. Installer Legwan sur la nouvelle machine.
2. A l'ecran de connexion, cliquer sur `Restaurer une boutique existante`.
3. Saisir l'email et le mot de passe de recuperation.
4. Legwan recharge l'application et retrouve les donnees cloud de la boutique.
5. Les utilisateurs internes Legwan se reconnectent ensuite avec leurs codes PIN habituels.

## Limite importante

Le code court affiche dans les parametres sert a identifier rapidement la boutique. La restauration autonome se fait avec le compte Email/Password, pas avec le code court seul.
