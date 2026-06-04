# TODO — Automatisation release GitHub

## Etape 1
- [x] Vérifier s’il existe déjà un workflow GitHub Actions dans `.github/workflows/`.

## Etape 2
- [x] Ajouter un workflow `release.yml` déclenché par `push` sur tags `v*`.

## Etape 3
- [x] Workflow : installer Node, lancer tests, builder Electron (mode safe), puis créer la GitHub Release et uploader les assets.

## Etape 4
- [x] Ajouter une stratégie de versioning (tag requis) + utiliser secrets nécessaires (TOKEN GitHub + éventuellement secrets code-signing).

## Etape 5
- [x] Valider via simulation ou check statique : le workflow doit passer YAML lint rapide / logique.


