// *
// Metromobilité is the mobile application of Grenoble Alpes Métropole <http://www.metromobilite.fr/>.
// It provides all the information and services for your travels in Grenoble agglomeration.

// Copyright (C) 2013
// Contributors:
//	NB/VT - sully-group - www.sully-group.fr - initialisation and implementation

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
// *

// module pour la mise a disposition des données statiques des voitures en autopartage citelib

var co = require('co');
var axios = require('axios');
var dyn = require('./dynWs');
var main = require('./index');


exports.type = 'poteauBIVtoTest';		//todo type='poteauBIV' une fois validé par Solari

exports.init = async function (config) {
	main.eventEmitter.on('otpLoaded', async function (evt) {
		chargeBIV();
	});
}
async function chargeBIV(){
	config=main.getConfig();
	var tap=5;			//Durée d’affichages de la page ‘temps d’attente’ (seconds) 
	var taic=8;			//Durée d’affichages de la page ‘messagerie commerciale’ (seconds)
	var nb_hor=2;		//Nombre de temps d’attente à afficher pour la ligne
	var pri=1;			//Priorité d'une ligne de bus
	
	if (!global.ref) {
		console.error(exports.type  + " : Erreur objet global.ref vide");
		return;
	}

	global.ref[exports.type]={type: 'FeatureCollection', features: []};
	
	
	const res = await axios({
		method:'post',
		url:config.plugins.otpHoraires.url+'/routers/default/index/graphql', 
		timeout: 10000,
		responseType: 'json', 
		data:{ query: '{ stops{ gtfsId name lat lon code desc locationType direction patterns{ code directionId headsign route{ gtfsId shortName } } } }' }//patterns{ code directionId headsign trips { gtfsId } stops { gtfsId code name } }
	});
	
	if (res.status!=200 || res.statusText!='OK') {
		console.error(exports.type  + " : Erreur post OTP status : " + res.status + " Message : " + res.statusText);
		return;
	}

	var stops = res.data.data.stops;
	
	console.log("BIV URL de Test : http://localhost:3000/api/findType/json?types=poteauBIVtoTest");

	var nbbiv=1000; //Numéro de Borne. A définir à partir de 1000
	
	for(var s1 in stops) {
		try {
			var patterns = stops[s1].patterns;
			var trouve = false;

			for(var p1 in patterns) { //recherche si une au mon s des lignes passe par cet arrêt.
				for(var l in config.plugins.biv.listeLignes) {
					if (config.plugins.biv.listeLignes[l] == patterns[p1].route.shortName)
					{
						trouve = true;
						break;
					}
				}
			}

			if (trouve) {
				
				var f = {
					type: 'Feature',
					properties: {
						"NBIV": nbbiv++,
						"CODE_ARRET": stops[s1].gtfsId.split(':')[0] + '_' + stops[s1].code,
						"stop_lon": stops[s1].lon,
						"stop_lat": stops[s1].lat,
						"ARRET": stops[s1].name,
						"TAP": tap,
						"TAIC": taic,
						"LBIV": []
					}
				};				
				for(var p2 in patterns) {
							var d1 = {
								"NLG": patterns[p2].route.shortName,
								"SENS": (patterns[p2].directionId==0?"A":"R"),
								"NB_HOR": nb_hor,
								"PRI": pri
							}
							f.properties.LBIV.push(d1);
				}

				if (config.plugins.biv.c38) { //recherche des lignes transIsere dans la meme zone d'arret.

					if (global.refStopsLinks.features && global.refStopsLinks.features.length==0)	{
						console.error("stopLinks non initialisé : Erreur dans le chargement des BIV");
					}

					for(var s2 in stops) { //recherche de la zone d'arret C38 commnune à la SEM
						if (global.refStopsLinks.objects['SEM:'+stops[s1].code])
							if (global.refStopsLinks.objects['SEM:'+stops[s1].code] == stops[s2].gtfsId.split(':')[0] + ':' +  stops[s2].code) {
								for(var p3 in stops[s2].patterns) {
									var d2 = {
										"NLG": stops[s2].patterns[p3].route.shortName,
										"SENS": (stops[s2].patterns[p3].directionId==0?"A":"R"),
										"NB_HOR": nb_hor,
										"PRI": pri
									}
									f.properties.LBIV.push(d2);
								}
							}
					}

				}

				global.ref[exports.type].features.push(f);
			}
		}
		catch(e) {
			console.error(exports.type  + " : Erreur dans le chargement des BIV");
		}
	}
	console.log(exports.type+' loaded, total : '+global.ref[exports.type].features.length);
	
	return false;
}
