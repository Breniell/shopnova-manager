# Importer vos produits depuis Excel

Ce dossier contient le fichier **`modele-import-produits.csv`** à envoyer aux
commerçants qui veulent charger leur catalogue d'un coup plutôt que fiche par
fiche.

Le même modèle est téléchargeable depuis le logiciel : **Produits ▸ Importer ▸
Télécharger le modèle**. Préférez ce chemin quand c'est possible, il est
toujours à jour.

---

## La marche à suivre, à transmettre au client

1. Ouvrir le modèle dans Excel.
2. Remplacer les lignes d'exemple par ses propres produits, **une ligne par
   produit**.
3. **Fichier ▸ Enregistrer sous**, et choisir le type **CSV**.
4. Dans Legwan : **Produits ▸ Importer**, choisir le fichier.
5. Un aperçu s'affiche : nombre de produits, critères détectés, lignes
   ignorées. **Rien n'est enregistré tant qu'il n'a pas confirmé.**

---

## Les colonnes

| Colonne | Obligatoire | Remarque |
|---|---|---|
| Nom | **oui** | |
| Prix vente | **oui** | |
| Categorie | non | créée automatiquement si elle n'existe pas encore |
| Prix achat | non | 0 par défaut |
| Stock | non | 0 par défaut |
| Seuil | non | 5 par défaut ; déclenche l'alerte de stock bas |
| Code-barres | non | généré automatiquement si laissé vide |
| Description | non | |

Les libellés sont reconnus **sans tenir compte des accents ni de la casse**, et
les équivalents anglais fonctionnent aussi (`Name`, `Sale price`, `Quantity`…).
L'ordre des colonnes n'a pas d'importance.

## Les déclinaisons (tailles, couleurs, modèles)

**Toute colonne qui n'est pas dans le tableau ci-dessus devient un critère de
déclinaison.** Les lignes portant le même nom de produit deviennent alors les
déclinaisons d'un même article, chacune avec ses propres prix et son propre
stock.

Dans le modèle, `Longueur` et `Couleur` servent d'exemple. Un vendeur de
chaussures écrira `Pointure`, un vendeur de téléphones `Capacité` — le nom de
la colonne devient le nom du critère dans le logiciel.

## Ce qu'il faut savoir avant d'envoyer le fichier

- **Un produit déjà présent n'est jamais dupliqué.** Il est reconnu par son
  code-barres, sinon par son nom. Le client choisit alors de l'ignorer ou de
  mettre à jour prix, seuil et catégorie.
- **Un import ne modifie jamais le stock d'un produit existant.** Le stock ne
  bouge que par une entrée de stock ou un inventaire, qui laissent une trace au
  registre.
- **Les accents sont gérés dans les deux sens.** Excel enregistre souvent en
  ANSI plutôt qu'en UTF-8 ; Legwan le détecte et lit « Hygiène » correctement.
- **Le séparateur est détecté.** Point-virgule (Excel français) comme virgule
  (Excel anglophone).
- **Les montants tolèrent les espaces et la virgule décimale.** « 1 500,00 »
  vaut 1500. Le FCFA ne s'écrivant pas en centimes, les décimales sont
  arrondies.

## Si une ligne est refusée

L'aperçu indique le numéro de ligne et la raison. Les causes habituelles :

- prix de vente manquant ou non numérique ;
- nom vide ;
- même code-barres utilisé deux fois dans le fichier ;
- deux lignes identiques sur tous les critères de déclinaison.

**Les lignes saines sont importées quand même** : une ligne fautive ne fait
jamais perdre le reste du fichier.
