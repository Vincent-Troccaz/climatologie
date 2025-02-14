var map = L.map('map').setView([45.7, 6.4], 9);

// Modifier l'attribution de la carte pour inclure les sources et l'auteur
map.attributionControl.setPrefix(
    'Données: <a href="https://www.drias-climat.fr/" target="_blank">DRIAS</a> | '
    + 'Cartographie:<span class="leaflet-flag"></span> <a href="https://leafletjs.com/" target="_blank">Leaflet</a> '
    + '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> | '
    + 'Auteur: LP SIG 2024/25'
);


// Ajouter une couche OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: ''
}).addTo(map);

var geojsonLayer;
var labelLayer = L.layerGroup().addTo(map); // Regroupe les labels
var allGeoJSON = null;
var playing = false;
var interval = null;
//let selectedScenario = "REF"; // Par défaut, affichage du RCP8.5


// Vérifier si une variable a été enregistrée dans le stockage local
var savedVariable = localStorage.getItem("selectedVariable");
var selectedVariable = savedVariable ? savedVariable : "TAV"; // Par défaut, température affichée

var savedScenario = localStorage.getItem("selectedScenario");
var selectedScenario = savedScenario ? savedScenario : "REF"; // Par défaut, affichage du REF

// Appliquer la sélection à l'interface utilisateur (cocher le bon bouton radio)
document.addEventListener("DOMContentLoaded", function () {
    console.log("Page Chargée, ajout des écouteurs")

    let radioButtons = document.querySelectorAll('input[name="variable"]');
    radioButtons.forEach(radio => {
        if (radio.value === selectedVariable) {
            radio.checked = true;
        }
    });

    // Écouter les changements d'altitude, d'année et de variable
    document.getElementById('altitudeRange').addEventListener('input', function() {
        document.getElementById('altitudeValue').innerText = this.value;
        updateMap();
    });
    
    document.getElementById('yearRange').addEventListener('input', function() {
        document.getElementById('yearValue').innerText = this.value;
        updateMap();
    });
    
    document.querySelectorAll('input[name="variable"]').forEach(input => {
        input.addEventListener('change', function() {
            selectedVariable = this.value;
            localStorage.setItem("selectedVariable", selectedVariable); // Sauvegarder la sélection
            updateMap();
            updateLegend();
        });
    });
    
    // Gérer le bouton Play/Pause
    document.getElementById('playPause').addEventListener('click', function() {
        playing = !playing;
        if (playing) {
            this.innerText = "⏸️";
            startAnimation();
        } else {
            this.innerText = "▶️";
            clearInterval(interval);
        }
    });

    // Charger les données pour la première fois
    loadScenarioData();
});

// Ecouteur d'événements pour le sélecteur de scénario
document.querySelectorAll('input[name="scenario"]').forEach(input => {
    input.addEventListener('change', function() {
        selectedScenario = this.value;
        console.log("Scénario sélectionné :", selectedScenario); // Vérification console
        loadScenarioData(); // Charger dynamiquement les nouvelles données
    });
});


// Fonction pour mettre à jour la plage des années
function updateYearRange() {
    let yearSlider = document.getElementById('yearRange');
    let yearValue = document.getElementById('yearValue');

    if (selectedScenario === "RCP") {
        yearSlider.min = 2006;
        yearSlider.max = 2100;
        yearSlider.value = 2006;
    } else {
        yearSlider.min = 1951;
        yearSlider.max = 2005;
        yearSlider.value = 1951;
    }

    yearValue.innerText = yearSlider.value; // Mettre à jour l'affichage
}

// Retourne le chemin du fichier data à charger en fonction du choix entre RCP ou Ref
function getDataFile() {
    return selectedScenario === "RCP" ? "export/data_rcp.json" : "export/data_ref.json";
}

let dataFileSelectedScenario = getDataFile(); // Déterminer l'URL du fichier JSON

function loadScenarioData() {
    let dataFileSelectedScenario = getDataFile(); // Déterminer dynamiquement le fichier JSON

    // Charger le shapefile et les données météo avec le fichier sélectionné dynamiquement
    Promise.all([
        shp("input/shape/Alpes.zip"),
        fetch(dataFileSelectedScenario).then(response => response.json())
    ])
    .then(function([geojson, dataStats]) {
    
        allGeoJSON = geojson;
    
        // Organiser les données par libelle
        let dataMap = {};
        dataStats.forEach(function(item) {
            let libelleName = item.Libelle;
            if (!dataMap[libelleName]) {
                dataMap[libelleName] = [];
            }
            dataMap[libelleName].push(item);
        });
    
        // Ajouter les données à chaque feature GeoJSON
        geojson.features.forEach(function(feature) {
            let libelleName = feature.properties.nom;
            if (dataMap[libelleName]) {
                feature.properties.donnees = dataMap[libelleName];
            }
        });
    
        // Mettre à jour la plage des années et la carte
        updateYearRange();
        updateMap();
    })
    .catch(function(error) {
        console.error("Erreur lors du chargement des données :", error);
    });
}
// Fonction pour mettre à jour la carte en fonction de l'altitude et de l'année
function updateMap() {
    let selectedAltitude = parseInt(document.getElementById('altitudeRange').value);
    let selectedYear = parseInt(document.getElementById('yearRange').value);
  
    if (geojsonLayer) {
      map.removeLayer(geojsonLayer);
    }
  
    labelLayer.clearLayers(); // Effacer les anciens labels
  
    let filteredFeatures = allGeoJSON.features.map(feature => {
      let libelleData = feature.properties.donnees || [];
      let filteredData = libelleData.filter(d => d.Altitude === selectedAltitude && d.Annee === selectedYear);
  
      if (filteredData.length > 0) {
        let newFeature = JSON.parse(JSON.stringify(feature));
        newFeature.properties.donnees = filteredData;
        return newFeature;
      }
      return null;
    }).filter(f => f !== null);
  
    let filteredGeoJSON = {
      type: "FeatureCollection",
      features: filteredFeatures
    };
  
    geojsonLayer = L.geoJSON(filteredGeoJSON, {
        style: function(feature) {
            let props = feature.properties;
            if (props.donnees && props.donnees.length > 0) {
                let value = props.donnees[0][selectedVariable]; // Température ou enneigement
                let color = getColor(value);
                return { 
                    color: "grey", 
                    weight: 2,
                    opacity: 1, 
                    fillColor: color, 
                    fillOpacity: 0.8 };
            }
            return { 
                color: "gray",
                weight: 2,
                opacity: 1,
                fillColor: "#999",
                fillOpacity: 0.5
            };
        },
        onEachFeature: function(feature, layer) {
            let props = feature.properties;
            let popupContent = `<strong>${props.nom}</strong><br/>`;
  
            if (props.donnees) {
                popupContent += `<ul>`;
                props.donnees.forEach(d => {
                    popupContent += `<li>Année: ${d.Annee} | Température: ${d.TAV}°C | Enneigement: ${d.SNDAV}cm</li>`;
                });
                popupContent += `</ul>`;
            } else {
                popupContent += `Pas de données disponibles`;
            }
  
            layer.bindPopup(popupContent);
  
            // Ajouter un label sur le polygone
            let center = getCentroid(layer); // Calcul du centroïde géométrique
            if (center) {
                let labelText = selectedVariable === "TAV" ? `${props.donnees[0].TAV}°C` : `${props.donnees[0].SNDAV} cm`;
                let label = L.marker(center, {
                    icon: L.divIcon({
                        className: 'label',
                        html: `<b>${labelText}</b>`,
                        iconSize: [30, 20]
                    })
                });
            labelLayer.addLayer(label);
            }
        }
    }).addTo(map);

    updateLegend();
  }
  
// Fonction pour calculer le centroïde d'un polygone
function getCentroid(layer) {
    let latlngs = layer.feature.geometry.coordinates;
  
    // Gérer les MultiPolygons en prenant le premier polygone
    if (layer.feature.geometry.type === "MultiPolygon") {
      latlngs = latlngs[0][0]; // On prend uniquement la première partie du MultiPolygon
    } else if (layer.feature.geometry.type === "Polygon") {
      latlngs = latlngs[0]; // Premier anneau du polygone
    } else {
      return null; // Pas un polygone
    }
  
    let centroid = turf.centroid(layer.feature); // Utilisation de Turf.js pour un centroïde précis
    return [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]]; // Retourner lat, lng
  }
  
  
// Fonction pour animer le changement d'année
function startAnimation() {
    interval = setInterval(() => {
        let yearSlider = document.getElementById('yearRange');
        let currentYear = parseInt(yearSlider.value);
  
        if (currentYear < parseInt(yearSlider.max)) {
            yearSlider.value = currentYear + 2;
        } else {
            yearSlider.value = parseInt(yearSlider.min);
        }
        document.getElementById('yearValue').innerText = yearSlider.value;
        updateMap();
    }, 1000);
}
  
function interpolateColor(value, minValue, maxValue, colors) {
    let normalized = (value - minValue) / (maxValue - minValue);
    normalized = Math.max(0, Math.min(1, normalized)); // S'assurer que la valeur est entre 0 et 1

    let index = Math.floor(normalized * (colors.length - 1));
    return colors[index];
}

function getColor(value) {
    if (selectedVariable === "SNDAV") {
        // Palette YlGnBu (du jaune au bleu foncé)
        let colors = [
            "rgb(255, 255, 217)", // Jaune clair
            "rgb(199, 233, 180)", // Vert clair
            "rgb(127, 205, 187)", // Vert turquoise
            "rgb(65, 182, 196)",  // Bleu clair
            "rgb(29, 145, 192)",  // Bleu moyen
            "rgb(34, 94, 168)",   // Bleu foncé
            "rgb(12, 44, 132)"    // Bleu très foncé
        ];
        return interpolateColor(value, 0, 300, colors);
    }

    else if (selectedVariable === "TAV") {
        // Palette YlOrRd (du jaune au rouge foncé)
        let colors = [
            "rgb(12, 44, 132)",  // Bleu très foncé (-9°C)
            "rgb(34, 94, 168)",  // Bleu foncé (-7°C)
            "rgb(65, 182, 196)",  // Bleu clair (-5°C)
            "rgb(127, 205, 187)", // Cyan clair (-3°C)
            "rgb(199, 233, 180)", // Vert clair (0°C)
            "rgb(255, 255, 178)", // Jaune clair (2°C)
            "rgb(254, 217, 118)", // Jaune moyen (4°C)
            "rgb(253, 141, 60)"   // Orange (6°C et au-delà)
        ];
        return interpolateColor(value, -9, 6, colors);

    }

    return "#999"; // Couleur par défaut si aucune donnée
}
 
function updateLegend() {
    let legend = document.getElementById("legend");

    if (!legend) {
        console.error("Erreur : Élément 'legend' introuvable dans le DOM.");
        return;
    }

    legend.innerHTML = ""; // Réinitialiser la légende

    let title = document.createElement("div");
    title.className = "legend-title";
    legend.appendChild(title);

    let scale = document.createElement("div");
    scale.className = "legend-scale";
    legend.appendChild(scale);

    let colors, values;

    if (selectedVariable === "SNDAV") {
        title.innerText = "Cumul de neige (cm)";
        colors = [
            "rgb(12, 44, 132)",     // Bleu très foncé
            "rgb(34, 94, 168)",    // Bleu foncé
            "rgb(29, 145, 192)",   // Bleu moyen
            "rgb(65, 182, 196)",   // Bleu clair
            "rgb(127, 205, 187)",  // Vert turquoise
            "rgb(199, 233, 180)",  // Vert clair
            "rgb(255, 255, 217)"  // Jaune clair
        ];
        values = ["300+", "250", "200", "150", "100", "50", "0"];
    } else if (selectedVariable === "TAV") {
        title.innerText = "Température (°C)";
        colors = [
            "rgb(253, 141, 60)",   // Orange (6°C et au-delà)
            "rgb(254, 217, 118)", // Jaune moyen (4°C)
            "rgb(255, 255, 178)", // Jaune clair (2°C)
            "rgb(199, 233, 180)", // Vert clair (0°C)
            "rgb(127, 205, 187)", // Cyan clair (-3°C)
            "rgb(65, 182, 196)",  // Bleu clair (-5°C)
            "rgb(34, 94, 168)",  // Bleu foncé (-7°C)
            "rgb(12, 44, 132)",  // Bleu très foncé (-9°C)
        ];
        values = ["6+", "4", "2", "0", "-3", "-5", "-7", "-9"];
    } else {
        // Si la variable n'est pas définie, cacher la légende
        legend.style.visibility = "hidden";
        return;
    }

    // Remplir la légende avec les couleurs et valeurs correspondantes
    for (let i = 0; i < colors.length; i++) {
        let item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<span class="legend-color" style="background:${colors[i]}"></span> ${values[i]}`;
        scale.appendChild(item);
    }

    // Afficher la légende
    legend.style.visibility = "visible";
}

// ------------------------------ Sélecteur des Massifs -------------------------


document.addEventListener('DOMContentLoaded', function() {
    const libelleSelect = document.getElementById('libelleSelect');
    const refImage = document.getElementById('refImage');
    const rcpImage = document.getElementById('rcpImage');
    const parameterRadios = document.getElementsByName('parameter');

    // Dictionnaire associant le libellé original à sa version formatée (remplacement de "-" par "_")
    const libelleMap = {};

    // Fonction de mise à jour des images en fonction du bouton radio et du massif sélectionné
    function updateImages() {
        // Récupérer la valeur sélectionnée dans le menu déroulant
        const selectedMassif = libelleSelect.value;
        // Déterminer le type de données sélectionné via les boutons radio
        const selectedParameter = Array.from(parameterRadios).find(radio => radio.checked)?.value;
      
        // Par défaut, utiliser "Haute_Maurienne" si aucun massif n'est choisi
        const defaultMassif = "Haute_Maurienne";
        const massif = selectedMassif !== "" ? selectedMassif : defaultMassif;
        // Récupérer la version formatée (si disponible), sinon on formate directement
        const formattedMassif = libelleMap[massif] || massif.replace(/-/g, '_').replace(/\s+/g, '_');

        let refPath = "";
        let rcpPath = "";

        // Choix des dossiers et préfixes selon le bouton radio sélectionné
        if (selectedParameter === "enneigement") {
            refPath = "export/Matrice_Cumul_Neige_ref/matrice_neige_station_ref_";
            rcpPath = "export/Matrice_Cumul_Neige_RCP/matrice_neige_station_RCP_";
        } else {  // Par défaut, "temperature"
            refPath = "export/Matrice_Temperature_Ref/matrice_temp_station_ref_";
            rcpPath = "export/Matrice_Temperature_RCP/matrice_temp_station_RCP_";
        }
        
        refImage.src = refPath + formattedMassif + ".svg";
        rcpImage.src = rcpPath + formattedMassif + ".svg";
    }

    // Chargement du fichier JSON
    fetch('export/data_ref.json')
        .then(response => {
            if (!response.ok) {
            throw new Error('Erreur lors du chargement du fichier JSON');
            }
            return response.json();
        })
        .then(data => {
            // Création d'un ensemble de libellés
            const libelleSet = new Set();
            data.forEach(item => {
                if (item.Libelle) {
                    libelleSet.add(item.Libelle);
                }
            });
            // Remplissage du <select> et création du dictionnaire formaté
            libelleSet.forEach(libelle => {
                // Création de la version formatée en remplaçant les tirets par des underscores
                const formattedLibelle = libelle.replace(/-/g, '_').replace(/\s+/g, '_');
                libelleMap[libelle] = formattedLibelle;
                
                const option = document.createElement('option');
                option.value = libelle; // Valeur d'origine
                option.textContent = libelle;
                libelleSelect.appendChild(option);
            });
            // Mise à jour des images après le chargement initial des options
            updateImages();
        })
        .catch(error => console.error('Erreur de chargement du JSON:', error));

    // Écouteur pour le changement du menu déroulant
    libelleSelect.addEventListener('change', updateImages);

    // Écouteurs pour le changement de bouton radio
    parameterRadios.forEach(radio => {
        radio.addEventListener('change', updateImages);
    });
  });

