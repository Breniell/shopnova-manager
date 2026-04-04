import beerCastel from './products/beer-castel.jpg';
import waterBottle from './products/water-bottle.jpg';
import riceThai from './products/rice-thai.jpg';
import oilVegetable from './products/oil-vegetable.jpg';
import soap from './products/soap.jpg';
import mayonnaise from './products/mayonnaise.jpg';
import sardines from './products/sardines.jpg';
import biscuits from './products/biscuits.jpg';
import milkNido from './products/milk-nido.jpg';
import cocaCola from './products/coca-cola.jpg';
import toothpaste from './products/toothpaste.jpg';
import sugar from './products/sugar.jpg';
import flour from './products/flour.jpg';
import coffeeNescafe from './products/coffee-nescafe.jpg';
import gasButane from './products/gas-butane.jpg';
import phoneSamsung from './products/phone-samsung.jpg';
import cableUsbc from './products/cable-usbc.jpg';
import diapersPampers from './products/diapers-pampers.jpg';
import tomatoPaste from './products/tomato-paste.jpg';
import batteries from './products/batteries.jpg';
import detergentOmo from './products/detergent-omo.jpg';
import chocolate from './products/chocolate.jpg';
import juiceOrange from './products/juice-orange.jpg';
import chipsPringles from './products/chips-pringles.jpg';
import spaghetti from './products/spaghetti.jpg';

export const productImages: Record<string, string> = {
  p1: beerCastel,
  p2: waterBottle,
  p3: riceThai,
  p4: oilVegetable,
  p5: soap,
  p6: mayonnaise,
  p7: sardines,
  p8: biscuits,
  p9: milkNido,
  p10: cocaCola,
  p11: toothpaste,
  p12: sugar,
  p13: flour,
  p14: coffeeNescafe,
  p15: gasButane,
  p16: phoneSamsung,
  p17: cableUsbc,
  p18: diapersPampers,
  p19: tomatoPaste,
  p20: batteries,
  p21: detergentOmo,
  p22: chocolate,
  p23: juiceOrange,
  p24: chipsPringles,
  p25: spaghetti,
};

// Category fallback colors for products without images
export const categoryColors: Record<string, string> = {
  'Alimentation': '#F59E0B',
  'Boissons': '#3B82F6',
  'Hygiène': '#10B981',
  'Électronique': '#8B5CF6',
  'Vêtements': '#EC4899',
  'Électroménager': '#6366F1',
  'Autre': '#6B7280',
};
