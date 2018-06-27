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

// module de distribution des geometries des tronçons routiers

var findWS = require('./findWS');

//https://data.metromobilite.fr/api/bbox/json?types=PAR
//http://localhost:3000/api/bbox/json?types=PAR
exports.initRef = function(type){
	global.ref[type].features.forEach(function (feature,index){

		var params = {x:feature.geometry.coordinates[0],y:feature.geometry.coordinates[1]};
		var lines = [];
		
		findWS.linesNear(params,lines,null);

		global.ref[type].features[index].properties.LINES = JSON.stringify(lines).replace(/[^A-Za-z0-9:,]/g,'').replace(/[:]/g,'_');	
	});
	
	console.log(type+' loaded, total : '+global.ref[type].features.length);	
}