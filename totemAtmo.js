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

//	module de gestion des données Atmo
//	indiceAtmo : vieux format
//	indiceAtmoFull : futur format en attente
//	indiceAtmoFake : vielles données dans futur format
//	si on met le parametre appMetromobilite sur le type indiceAtmoFull on retourne l'indiceAtmoFake a la place de l'indiceAtmoFull

var main = require('./index');
var dyn = require('./dynWS');

global.totemAtmo={
	forceValue:-1
}

main.eventEmitter.on('updateDynData', function (evt) {
	if (evt.type == 'indiceAtmoFull') dyn.ajouterType(type,calculNiveauTotem(evt.data));
});
const type = 'totemAtmo';
exports.init = function() {
	dyn.ajouterType(type,0);
}
// -1 : non forcé
// 0 : inconnu
// 1 : <= 50
// 2 : <= 60
// 3 : <= 90
// 4 : > 90 
exports.forceValeur = function(valeur){
	if([-1,0,1,2,3,4].indexOf(valeur)!=-1)	global.totemAtmo.forceValue=valeur;
	dyn.ajouterType(type,calculNiveauTotem(global.dyn.indiceAtmoFull));
}
function calculNiveauTotem(d){
	try {
		if(global.totemAtmo.forceValue !=-1) {
			return global.totemAtmo.forceValue;
		} else if(!d) return 0;
		for (var indice of d.indice_exposition_sensible){
			if(indice.date == d.date) {
				var ind = parseFloat(indice.valeur);
				if(ind <= 50) return 1;
				else if(ind > 50 && ind <= 60) return 2;
				else if(ind > 60 && ind <= 90) return 3;
				else return 4;
			}
		}
	} catch(e){
		main.dumpError(e,'totemAtmo.calculNiveauTotem');
	}
	return 0;
}