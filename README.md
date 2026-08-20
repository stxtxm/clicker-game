# 🌿 Weed Clicker

**Un clicker game original : cultive, effeuille, transforme et vends !**

Chaque clic = une tête effeuillée. Accumule des têtes de cannabis, transforme-les en produits plus rentables (herbe → résine → hash), vends le tout et utilise l'argent pour acheter des upgrades qui automatisent et boostent ta production.

---

## 🎮 Concept du Jeu

### 🌱 Mécanique de base
1. **Clique** sur la plante 🌿 pour **effeuiller des têtes**
2. Les têtes s'accumulent automatiquement
3. **Transforme** tes têtes en produits dérivés (herbe, résine, hash)
4. **Vends** tes produits pour gagner de l'argent
5. **Achète des upgrades** pour automatiser et optimiser ta production

### 💰 Économie du jeu

| Produit | Prix | Obtention |
|---------|------|-----------|
| Herbe 🌿 | $10/g | 1 tête = 1g |
| Résine 🧪 | $50/g | 5g herbe → 1g résine |
| Hash 🟫 | $100/g | 3g résine → 1g hash |

### 🏗️ Upgrades

| Upgrade | Effet | Coût |
|---------|-------|------|
| Ciseaux Pro | +1 tête/clic | $50 |
| Cultivateur Auto | +1 tête/sec | $200 |
| Extracteur Résine | Convertit herbe → résine | $500 |
| Labo Hash | Convertit résine → hash | $2000 |
| Graines Premium | +25% production | $1000 |
| Équipe 👥 | +5 têtes/sec/niveau | $5000 |

---

## 🚀 Démarrage

```bash
cd /home/timo/dev/clicker-game
python3 -m http.server 8000
```

**URLs :**
- Local: http://localhost:8000
- **Tailscale: http://100.126.62.102:8000**

---

## 📁 Structure

```
clicker-game/
├── index.html    # Jeu complet
├── server.py     # Serveur optionnel
└── README.md
```

---

## 🎯 Stratégie

1. Clique pour accumuler 50 têtes
2. Achète Ciseaux Pro (Lvl 2-3)
3. Achète Cultivateur Auto
4. Achète Extracteur Résine
5. Achète Labo Hash
6. Engage une Équipe !

---

## 🛠️ Personnalisation

Modifie `index.html` pour changer prix, taux, upgrades.

---

**Créé pour tester via Tailscale !** 🌿💰
