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

// module de recherche associé aux données chargées par le module points.js
// recherches d'objets ponctuels en mode geographique ou texte

var turf = require('turf');
var fs = require('fs');
var querystring = require('querystring');
var xml2js = require('xml2js');
var j2xls = require('json2xls-xml')({ pretty : true });
var main = require('./index');

var distNear = 300;
var findIgnore = ["N°","COL","PARC","PIED","CLOS","PLAN","PONT","QUAI","COURS","COUR","SQUARE","TUNNEL","CHEMIN","HAMEAU","SENTIER","DOMAINE","PASSAGE","COLLEGE","VILLAGE","LIEU-DIT","BOULEVARD","ECHANGEUR","CARREFOUR","ROND-POINT","LOTISSEMENT","RUE","VOIE","CITE","GARE","PLACE","ROUTE","MAIRIE","GRANDE","GRANDE","MONTEE","PLAINE","ROCADE","TRAVERSE","RESIDENCE","PASSERELLE","DEPARTEMENTALE","NATIONALE","ILE","ALLEE","AVENUE","IMPASSE","ECHANGEUR","AUTOROUTE","INSTITUTION"];

exports.init = function *() {
	var config = main.getConfig();
	try {
		// init chargement liste d'echangeurs
		var data = fs.readFileSync(config.dataPath+'Echangeurs.xml', 'utf8');
		var parser = new xml2js.Parser();
		parser.parseString(data, function (err, result) {
			parseAxes(result);
		});
		console.log('filtrage geographique');
		var data = fs.readFileSync(config.dataPath+config.dataFilter, 'utf8');
		var rectangle = JSON.parse(data);
		var pointsRectangle = turf.within(global.poi, rectangle);
		global.poi = pointsRectangle;
	} catch(e){
		main.dumpError(e,'find.init');
	}
}

exports.initKoa = function (app,route) {
	// http://data.metromobilite.fr/api/linesNear/json?x=5.709360123&y=45.176494599999984&dist=400&details=true
	app.use(route.get('/api/linesNear/json', function *() {
		try{
			var params = querystring.parse(this.querystring);
			if (!params.x || !params.y) return [];
			
			if(!params.dist) params.dist = distNear;
			if(!params.details) params.details = false;
			
			var pointCentral = {
				"type": "Feature",
				"properties": {},
				"geometry": {
					"type": "Point",
					"coordinates": [params.x, params.y]
				}
			};
			var distance = params.dist/2000;
			var bearing = -90;
			var units = 'kilometers';

			var ptemp = turf.destination(pointCentral, distance, bearing, units);
			bearing = -180;
			var pmin = turf.destination(ptemp, distance, bearing, units);
			bearing = 0;
			distance=params.dist/1000;
			ptemp = turf.destination(pmin, distance, bearing, units);
			bearing = 90;
			var pmax = turf.destination(ptemp, distance, bearing, units);
			
			var q = this.querystring+'&types=pointArret&xmin='+pmin.geometry.coordinates[0]+'&xmax='+pmax.geometry.coordinates[0]+'&ymin='+pmin.geometry.coordinates[1]+'&ymax='+pmax.geometry.coordinates[1];
			
			var p = querystring.parse(q);
			var ptsWithin = exports.findObjectGeom(p,global.poi);
			
			var lines = [];
			var linesAdded = {};
			var details = [];
			ptsWithin.features.forEach(function (feature,index){
				var id = feature.properties.CODE.replace('_',':');
				var stop = {
					id:id,
					name:feature.properties.LIBELLE,
					lon:feature.geometry.coordinates[0],
					lat:feature.geometry.coordinates[1],
					lines:[]
				};
				global.poteaux[id].lgn.forEach(function(l){
					if(!linesAdded[l]){
						lines.push(l);
						linesAdded[l] = true;
					}
					stop.lines.push(l);
				});
				if(stop.lines.length>0) details.push(stop);
			});
			this.body = (params.details?details:lines);
		} catch(e){
			main.dumpError(e,'/api/linesNear/json');
		}
	}));

	// http://data.metromobilite.fr/api/findType/json?types=agenceM,pointService,dat&query=chavant
	app.use(route.get('/api/findType/json', function *() {
		try {
			var config = main.getConfig();
			//var params=extractUrlParams(decodeURIComponent(this.querystring));
			var params = querystring.parse(decodeURIComponent(this.querystring));
			ptsWithin = exports.findObjectQueryType(params,global.poi,config);
			this.body = ptsWithin;
		} catch(e){
			main.dumpError(e,'/api/findType/json');
		}
	}));

	// * http://data.metromobilite.fr/api/find/json?query=val
	app.use(route.get('/api/find/json', function *() {
		try {
			//var params=extractUrlParams(decodeURIComponent(this.querystring));
			var params = querystring.parse(decodeURIComponent(this.querystring));
			ptsWithin = exports.findObjectQuery(params,global.findText);
			this.body = ptsWithin;
		} catch(e){
			main.dumpError(e,'/api/find/json');
		}
	}));

	// http://data.metromobilite.fr/api/points/json?types=arret
	app.use(route.get('/api/points/json', function *() {
		try {
			//var params=extractUrlParams(this.querystring);
			var params = querystring.parse(this.querystring);
			ptsWithin = exports.findObjectCode(params,global.poi);
			this.body = ptsWithin;
		} catch(e){
			main.dumpError(e,'/api/points/json');
		}
	}));

	// http://data.metromobilite.fr/api/bbox/json?ymax=45.24044787140255&xmin=5.58581466027832&ymin=45.12077924804393&xmax=5.877467339721679&types=arret,pointArret
	app.use(route.get('/api/bbox/json', function *() {
		try {
			//var params=extractUrlParams(this.querystring);
			var params = querystring.parse(this.querystring);
			ptsWithin = exports.findObjectGeom(params,global.poi);
			this.body = ptsWithin;
		} catch(e){
			main.dumpError(e,'/api/bbox/json');
		}
	}));

	// http://data.metromobilite.fr/api/bbox/csv?ymax=45.24044787140255&xmin=5.58581466027832&ymin=45.12077924804393&xmax=5.877467339721679&types=arret,pointArret
	app.use(route.get('/api/bbox/csv', function *() {
		try {
			//var params=extractUrlParams(this.querystring);
			var params = querystring.parse(this.querystring);
			ptsWithin = exports.findObjectGeom(params,global.poi);
			var csvString="";
			//initialisation of column's name
			var properties = ptsWithin.features[0].properties;
			for(var p in properties) {
				csvString+="\""+p+"\",";
			}
			csvString+="lon,";
			csvString+="lat";
			csvString+="\n";
			
			//column's filling 
			ptsWithin.features.forEach(function (feature,index){
				var properties = feature.properties;
				for(var p in properties) {
					csvString+="\""+properties[p]+"\",";
				}
				var geometry = feature.geometry;
				csvString+=geometry.coordinates[0]+",";
				csvString+=geometry.coordinates[1]+"\n";
			});
			
			//header's filling
			this.body = csvString;
			this.set('Content-Type', 'text/csv');
			this.set('Content-Disposition', 'attachment;filename=export.csv');
			
		} catch(e){
			main.dumpError(e,'/api/bbox/csv');
		}
	}));

	// http://data.metromobilite.fr/api/bbox/xls?ymax=45.24044787140255&xmin=5.58581466027832&ymin=45.12077924804393&xmax=5.877467339721679&types=arret,pointArret
	app.use(route.get('/api/bbox/xls', function *() {
		try {
			//var params=extractUrlParams(this.querystring);
			var params = querystring.parse(this.querystring);
			ptsWithin = exports.findObjectGeom(params,global.poi);
			var obj = { feuille1:[]};
			
			//object filling 
			ptsWithin.features.forEach(function (feature,index){
				var properties = feature.properties;
				var geometry = feature.geometry;
				var xlsJsonLine ={};
				for(var p in properties){
					xlsJsonLine[p] = properties[p];
				}
				xlsJsonLine["lon"] = geometry.coordinates[0];
				xlsJsonLine["lat"] = geometry.coordinates[1];
				obj.feuille1.push(xlsJsonLine);
				//console.log(j2xls(obj));
			});
			
			//header's filling
			
			this.body = j2xls(obj);
			this.set('Content-Type', 'text/xls');
			this.set('Content-Disposition', 'attachment;filename=export.xls');
			
		} catch(e){
			main.dumpError(e,'/api/bbox/xls');
		}
	}));
}

exports.findObjectGeom = function(params,gPoi){
		if(typeof(params.xmin)=='undefined' 
		|| typeof(params.xmax)=='undefined' 
		|| typeof(params.ymin)=='undefined' 
		|| typeof(params.ymax)=='undefined'){
			params.xmin=3.0;
			params.xmax=10.0;
			params.ymin=40.0;
			params.ymax=50.0;
		}
		var searchWithin = {
		  "type": "FeatureCollection",
		  "features": [
			{
			  "type": "Feature",
			  "properties": {},
			  "geometry": {
				"type": "Polygon",
				"coordinates": [[
					[params.xmin, params.ymin],
					[params.xmin, params.ymax],
					[params.xmax, params.ymax],
					[params.xmax, params.ymin],
					[params.xmin, params.ymin]
				]]
			  }
			}
		  ]
		};
		var poiTyped={"type": "FeatureCollection", "features": []};
		var ptsWithin;
		if (params.types) {
			var types = params.types.split(',');
			poiTyped.features = gPoi.features.filter(function(f){
				return (types.indexOf(f.properties.type)!=-1);
			});
			ptsWithin = turf.within(poiTyped, searchWithin);
		} else {
			ptsWithin = turf.within(gPoi, searchWithin);
		}
		return ptsWithin;

}

exports.findObjectCode = function(params,gPoi){
	var poiTyped={"type": "FeatureCollection", "features": []};
	if (params.types) {
		var types = params.types.split(',');
		poiTyped.features = gPoi.features.filter(function(f){
			return (types.indexOf(f.properties.type)!=-1);
		});
	}
	var ptsCodes=poiTyped;
	if (params.codes) {
		var codes = params.codes.split(',');
		ptsCodes.features = poiTyped.features.filter(function(f){
			return (codes.indexOf(f.properties.CODE)!=-1);
		});
	}
	return ptsCodes;
}
exports.findObjectQueryType = function(params,gPoi,config) {
	var poiTyped={"type": "FeatureCollection", "features": []};
	if (params.types) {
		var types = params.types.split(',');
		poiTyped.features = gPoi.features.filter(function(f){
			return (types.indexOf(f.properties.type)!=-1);
		});
	}
	var ptsQuery=poiTyped;
	if (params.query) {
		ptsQuery.features = poiTyped.features.filter(function(f){
			return cleanLib(f.properties[config.types[f.properties.type].find]).indexOf(cleanLib(params.query))!=-1;
		});
	}
	return ptsQuery;

}
exports.findObjectQuery = function(params,gFindText) {
	
	var res={"type": "FeatureCollection", "features": []};
	
	//copie du tableau
	res.features = gFindText.features.slice();
	
	if (params.query) {
		var query = cleanLib(params.query).trim();
		res.features = res.features.filter(function(f,idx){
			if(params.types && params.types.indexOf(f.properties.type)==-1) return false;
			if(f.properties.type != 'arret' && f.properties.type != 'axe' && query.length < 4) return false;
			if((!params.rect || params.rect!='2') && f.properties.rect == '2') return false;
			var d = matchWords(f,idx,query);
			//on met le poids dans l'enregistrement courant avant la copie
			this[idx].properties.dist = d;

			return d>query.split(' ').length;
		},res.features);
	}

	return res;
}
//fonction qui calcule le poids d'un enregistrement vis a vis de la chaine demandée complete
function matchWords(f,idx,query) {
	var dist = 0;
	var distCommune = 0;
	var words = cleanLib(query).split(" ");
	if(cleanLib(query) == cleanLib(f.properties.LIBELLE)) return words.length*10;
	words.forEach(function(w,i){
		if(f.properties.type != 'arret' && f.properties.type != 'axe' && w.length < 3) return;//test NB de 4 a 3 pour avoir lac
		if(f.properties.type == 'arret' && (w.length < 2 || w == 'LES' || w == 'DES')) return;
		if(f.properties.type != 'axe' && w.length < 3) return;
		var dw = matchWord(w,i,f);
		// test NB on match soit la commune soit le reste
		if (dw.dist>=dw.distCommune) 
			dist+=dw.dist;
		else 
			distCommune+=dw.distCommune;
	});
	if(dist>10) {//strictement superieur a 10 car sinon les levenstein a 1 sont aussi bien que les match sur 1 mot avec un 2e mot absent
		// on retranche 1 par mot dans l'enregistrement manquant dans la requete
		var  tabFeatureLib =  cleanLib(f.properties.LIBELLE).split(' ').forEach(function(fw){
			var bNotExist = words.indexOf(fw)==-1;
			if (/*fw.length>2 && fw != 'LES' && fw != 'DES' &&*/ (bNotExist)) {//test NB pour favoriser exactitude
				dist+=-1;
			}
		});
	}
	 return (dist>0?''+(dist+distCommune):0);
}

var maxLevDist = 1;
var Latinise={};Latinise.latin_map={"Á":"A","Ă":"A","Ắ":"A","Ặ":"A","Ằ":"A","Ẳ":"A","Ẵ":"A","Ǎ":"A","Â":"A","Ấ":"A","Ậ":"A","Ầ":"A","Ẩ":"A","Ẫ":"A","Ä":"A","Ǟ":"A","Ȧ":"A","Ǡ":"A","Ạ":"A","Ȁ":"A","À":"A","Ả":"A","Ȃ":"A","Ā":"A","Ą":"A","Å":"A","Ǻ":"A","Ḁ":"A","Ⱥ":"A","Ã":"A","Ꜳ":"AA","Æ":"AE","Ǽ":"AE","Ǣ":"AE","Ꜵ":"AO","Ꜷ":"AU","Ꜹ":"AV","Ꜻ":"AV","Ꜽ":"AY","Ḃ":"B","Ḅ":"B","Ɓ":"B","Ḇ":"B","Ƀ":"B","Ƃ":"B","Ć":"C","Č":"C","Ç":"C","Ḉ":"C","Ĉ":"C","Ċ":"C","Ƈ":"C","Ȼ":"C","Ď":"D","Ḑ":"D","Ḓ":"D","Ḋ":"D","Ḍ":"D","Ɗ":"D","Ḏ":"D","ǲ":"D","ǅ":"D","Đ":"D","Ƌ":"D","Ǳ":"DZ","Ǆ":"DZ","É":"E","Ĕ":"E","Ě":"E","Ȩ":"E","Ḝ":"E","Ê":"E","Ế":"E","Ệ":"E","Ề":"E","Ể":"E","Ễ":"E","Ḙ":"E","Ë":"E","Ė":"E","Ẹ":"E","Ȅ":"E","È":"E","Ẻ":"E","Ȇ":"E","Ē":"E","Ḗ":"E","Ḕ":"E","Ę":"E","Ɇ":"E","Ẽ":"E","Ḛ":"E","Ꝫ":"ET","Ḟ":"F","Ƒ":"F","Ǵ":"G","Ğ":"G","Ǧ":"G","Ģ":"G","Ĝ":"G","Ġ":"G","Ɠ":"G","Ḡ":"G","Ǥ":"G","Ḫ":"H","Ȟ":"H","Ḩ":"H","Ĥ":"H","Ⱨ":"H","Ḧ":"H","Ḣ":"H","Ḥ":"H","Ħ":"H","Í":"I","Ĭ":"I","Ǐ":"I","Î":"I","Ï":"I","Ḯ":"I","İ":"I","Ị":"I","Ȉ":"I","Ì":"I","Ỉ":"I","Ȋ":"I","Ī":"I","Į":"I","Ɨ":"I","Ĩ":"I","Ḭ":"I","Ꝺ":"D","Ꝼ":"F","Ᵹ":"G","Ꞃ":"R","Ꞅ":"S","Ꞇ":"T","Ꝭ":"IS","Ĵ":"J","Ɉ":"J","Ḱ":"K","Ǩ":"K","Ķ":"K","Ⱪ":"K","Ꝃ":"K","Ḳ":"K","Ƙ":"K","Ḵ":"K","Ꝁ":"K","Ꝅ":"K","Ĺ":"L","Ƚ":"L","Ľ":"L","Ļ":"L","Ḽ":"L","Ḷ":"L","Ḹ":"L","Ⱡ":"L","Ꝉ":"L","Ḻ":"L","Ŀ":"L","Ɫ":"L","ǈ":"L","Ł":"L","Ǉ":"LJ","Ḿ":"M","Ṁ":"M","Ṃ":"M","Ɱ":"M","Ń":"N","Ň":"N","Ņ":"N","Ṋ":"N","Ṅ":"N","Ṇ":"N","Ǹ":"N","Ɲ":"N","Ṉ":"N","Ƞ":"N","ǋ":"N","Ñ":"N","Ǌ":"NJ","Ó":"O","Ŏ":"O","Ǒ":"O","Ô":"O","Ố":"O","Ộ":"O","Ồ":"O","Ổ":"O","Ỗ":"O","Ö":"O","Ȫ":"O","Ȯ":"O","Ȱ":"O","Ọ":"O","Ő":"O","Ȍ":"O","Ò":"O","Ỏ":"O","Ơ":"O","Ớ":"O","Ợ":"O","Ờ":"O","Ở":"O","Ỡ":"O","Ȏ":"O","Ꝋ":"O","Ꝍ":"O","Ō":"O","Ṓ":"O","Ṑ":"O","Ɵ":"O","Ǫ":"O","Ǭ":"O","Ø":"O","Ǿ":"O","Õ":"O","Ṍ":"O","Ṏ":"O","Ȭ":"O","Ƣ":"OI","Ꝏ":"OO","Ɛ":"E","Ɔ":"O","Ȣ":"OU","Ṕ":"P","Ṗ":"P","Ꝓ":"P","Ƥ":"P","Ꝕ":"P","Ᵽ":"P","Ꝑ":"P","Ꝙ":"Q","Ꝗ":"Q","Ŕ":"R","Ř":"R","Ŗ":"R","Ṙ":"R","Ṛ":"R","Ṝ":"R","Ȑ":"R","Ȓ":"R","Ṟ":"R","Ɍ":"R","Ɽ":"R","Ꜿ":"C","Ǝ":"E","Ś":"S","Ṥ":"S","Š":"S","Ṧ":"S","Ş":"S","Ŝ":"S","Ș":"S","Ṡ":"S","Ṣ":"S","Ṩ":"S","Ť":"T","Ţ":"T","Ṱ":"T","Ț":"T","Ⱦ":"T","Ṫ":"T","Ṭ":"T","Ƭ":"T","Ṯ":"T","Ʈ":"T","Ŧ":"T","Ɐ":"A","Ꞁ":"L","Ɯ":"M","Ʌ":"V","Ꜩ":"TZ","Ú":"U","Ŭ":"U","Ǔ":"U","Û":"U","Ṷ":"U","Ü":"U","Ǘ":"U","Ǚ":"U","Ǜ":"U","Ǖ":"U","Ṳ":"U","Ụ":"U","Ű":"U","Ȕ":"U","Ù":"U","Ủ":"U","Ư":"U","Ứ":"U","Ự":"U","Ừ":"U","Ử":"U","Ữ":"U","Ȗ":"U","Ū":"U","Ṻ":"U","Ų":"U","Ů":"U","Ũ":"U","Ṹ":"U","Ṵ":"U","Ꝟ":"V","Ṿ":"V","Ʋ":"V","Ṽ":"V","Ꝡ":"VY","Ẃ":"W","Ŵ":"W","Ẅ":"W","Ẇ":"W","Ẉ":"W","Ẁ":"W","Ⱳ":"W","Ẍ":"X","Ẋ":"X","Ý":"Y","Ŷ":"Y","Ÿ":"Y","Ẏ":"Y","Ỵ":"Y","Ỳ":"Y","Ƴ":"Y","Ỷ":"Y","Ỿ":"Y","Ȳ":"Y","Ɏ":"Y","Ỹ":"Y","Ź":"Z","Ž":"Z","Ẑ":"Z","Ⱬ":"Z","Ż":"Z","Ẓ":"Z","Ȥ":"Z","Ẕ":"Z","Ƶ":"Z","Ĳ":"IJ","Œ":"OE","ᴀ":"A","ᴁ":"AE","ʙ":"B","ᴃ":"B","ᴄ":"C","ᴅ":"D","ᴇ":"E","ꜰ":"F","ɢ":"G","ʛ":"G","ʜ":"H","ɪ":"I","ʁ":"R","ᴊ":"J","ᴋ":"K","ʟ":"L","ᴌ":"L","ᴍ":"M","ɴ":"N","ᴏ":"O","ɶ":"OE","ᴐ":"O","ᴕ":"OU","ᴘ":"P","ʀ":"R","ᴎ":"N","ᴙ":"R","ꜱ":"S","ᴛ":"T","ⱻ":"E","ᴚ":"R","ᴜ":"U","ᴠ":"V","ᴡ":"W","ʏ":"Y","ᴢ":"Z","á":"a","ă":"a","ắ":"a","ặ":"a","ằ":"a","ẳ":"a","ẵ":"a","ǎ":"a","â":"a","ấ":"a","ậ":"a","ầ":"a","ẩ":"a","ẫ":"a","ä":"a","ǟ":"a","ȧ":"a","ǡ":"a","ạ":"a","ȁ":"a","à":"a","ả":"a","ȃ":"a","ā":"a","ą":"a","ᶏ":"a","ẚ":"a","å":"a","ǻ":"a","ḁ":"a","ⱥ":"a","ã":"a","ꜳ":"aa","æ":"ae","ǽ":"ae","ǣ":"ae","ꜵ":"ao","ꜷ":"au","ꜹ":"av","ꜻ":"av","ꜽ":"ay","ḃ":"b","ḅ":"b","ɓ":"b","ḇ":"b","ᵬ":"b","ᶀ":"b","ƀ":"b","ƃ":"b","ɵ":"o","ć":"c","č":"c","ç":"c","ḉ":"c","ĉ":"c","ɕ":"c","ċ":"c","ƈ":"c","ȼ":"c","ď":"d","ḑ":"d","ḓ":"d","ȡ":"d","ḋ":"d","ḍ":"d","ɗ":"d","ᶑ":"d","ḏ":"d","ᵭ":"d","ᶁ":"d","đ":"d","ɖ":"d","ƌ":"d","ı":"i","ȷ":"j","ɟ":"j","ʄ":"j","ǳ":"dz","ǆ":"dz","é":"e","ĕ":"e","ě":"e","ȩ":"e","ḝ":"e","ê":"e","ế":"e","ệ":"e","ề":"e","ể":"e","ễ":"e","ḙ":"e","ë":"e","ė":"e","ẹ":"e","ȅ":"e","è":"e","ẻ":"e","ȇ":"e","ē":"e","ḗ":"e","ḕ":"e","ⱸ":"e","ę":"e","ᶒ":"e","ɇ":"e","ẽ":"e","ḛ":"e","ꝫ":"et","ḟ":"f","ƒ":"f","ᵮ":"f","ᶂ":"f","ǵ":"g","ğ":"g","ǧ":"g","ģ":"g","ĝ":"g","ġ":"g","ɠ":"g","ḡ":"g","ᶃ":"g","ǥ":"g","ḫ":"h","ȟ":"h","ḩ":"h","ĥ":"h","ⱨ":"h","ḧ":"h","ḣ":"h","ḥ":"h","ɦ":"h","ẖ":"h","ħ":"h","ƕ":"hv","í":"i","ĭ":"i","ǐ":"i","î":"i","ï":"i","ḯ":"i","ị":"i","ȉ":"i","ì":"i","ỉ":"i","ȋ":"i","ī":"i","į":"i","ᶖ":"i","ɨ":"i","ĩ":"i","ḭ":"i","ꝺ":"d","ꝼ":"f","ᵹ":"g","ꞃ":"r","ꞅ":"s","ꞇ":"t","ꝭ":"is","ǰ":"j","ĵ":"j","ʝ":"j","ɉ":"j","ḱ":"k","ǩ":"k","ķ":"k","ⱪ":"k","ꝃ":"k","ḳ":"k","ƙ":"k","ḵ":"k","ᶄ":"k","ꝁ":"k","ꝅ":"k","ĺ":"l","ƚ":"l","ɬ":"l","ľ":"l","ļ":"l","ḽ":"l","ȴ":"l","ḷ":"l","ḹ":"l","ⱡ":"l","ꝉ":"l","ḻ":"l","ŀ":"l","ɫ":"l","ᶅ":"l","ɭ":"l","ł":"l","ǉ":"lj","ſ":"s","ẜ":"s","ẛ":"s","ẝ":"s","ḿ":"m","ṁ":"m","ṃ":"m","ɱ":"m","ᵯ":"m","ᶆ":"m","ń":"n","ň":"n","ņ":"n","ṋ":"n","ȵ":"n","ṅ":"n","ṇ":"n","ǹ":"n","ɲ":"n","ṉ":"n","ƞ":"n","ᵰ":"n","ᶇ":"n","ɳ":"n","ñ":"n","ǌ":"nj","ó":"o","ŏ":"o","ǒ":"o","ô":"o","ố":"o","ộ":"o","ồ":"o","ổ":"o","ỗ":"o","ö":"o","ȫ":"o","ȯ":"o","ȱ":"o","ọ":"o","ő":"o","ȍ":"o","ò":"o","ỏ":"o","ơ":"o","ớ":"o","ợ":"o","ờ":"o","ở":"o","ỡ":"o","ȏ":"o","ꝋ":"o","ꝍ":"o","ⱺ":"o","ō":"o","ṓ":"o","ṑ":"o","ǫ":"o","ǭ":"o","ø":"o","ǿ":"o","õ":"o","ṍ":"o","ṏ":"o","ȭ":"o","ƣ":"oi","ꝏ":"oo","ɛ":"e","ᶓ":"e","ɔ":"o","ᶗ":"o","ȣ":"ou","ṕ":"p","ṗ":"p","ꝓ":"p","ƥ":"p","ᵱ":"p","ᶈ":"p","ꝕ":"p","ᵽ":"p","ꝑ":"p","ꝙ":"q","ʠ":"q","ɋ":"q","ꝗ":"q","ŕ":"r","ř":"r","ŗ":"r","ṙ":"r","ṛ":"r","ṝ":"r","ȑ":"r","ɾ":"r","ᵳ":"r","ȓ":"r","ṟ":"r","ɼ":"r","ᵲ":"r","ᶉ":"r","ɍ":"r","ɽ":"r","ↄ":"c","ꜿ":"c","ɘ":"e","ɿ":"r","ś":"s","ṥ":"s","š":"s","ṧ":"s","ş":"s","ŝ":"s","ș":"s","ṡ":"s","ṣ":"s","ṩ":"s","ʂ":"s","ᵴ":"s","ᶊ":"s","ȿ":"s","ɡ":"g","ᴑ":"o","ᴓ":"o","ᴝ":"u","ť":"t","ţ":"t","ṱ":"t","ț":"t","ȶ":"t","ẗ":"t","ⱦ":"t","ṫ":"t","ṭ":"t","ƭ":"t","ṯ":"t","ᵵ":"t","ƫ":"t","ʈ":"t","ŧ":"t","ᵺ":"th","ɐ":"a","ᴂ":"ae","ǝ":"e","ᵷ":"g","ɥ":"h","ʮ":"h","ʯ":"h","ᴉ":"i","ʞ":"k","ꞁ":"l","ɯ":"m","ɰ":"m","ᴔ":"oe","ɹ":"r","ɻ":"r","ɺ":"r","ⱹ":"r","ʇ":"t","ʌ":"v","ʍ":"w","ʎ":"y","ꜩ":"tz","ú":"u","ŭ":"u","ǔ":"u","û":"u","ṷ":"u","ü":"u","ǘ":"u","ǚ":"u","ǜ":"u","ǖ":"u","ṳ":"u","ụ":"u","ű":"u","ȕ":"u","ù":"u","ủ":"u","ư":"u","ứ":"u","ự":"u","ừ":"u","ử":"u","ữ":"u","ȗ":"u","ū":"u","ṻ":"u","ų":"u","ᶙ":"u","ů":"u","ũ":"u","ṹ":"u","ṵ":"u","ᵫ":"ue","ꝸ":"um","ⱴ":"v","ꝟ":"v","ṿ":"v","ʋ":"v","ᶌ":"v","ⱱ":"v","ṽ":"v","ꝡ":"vy","ẃ":"w","ŵ":"w","ẅ":"w","ẇ":"w","ẉ":"w","ẁ":"w","ⱳ":"w","ẘ":"w","ẍ":"x","ẋ":"x","ᶍ":"x","ý":"y","ŷ":"y","ÿ":"y","ẏ":"y","ỵ":"y","ỳ":"y","ƴ":"y","ỷ":"y","ỿ":"y","ȳ":"y","ẙ":"y","ɏ":"y","ỹ":"y","ź":"z","ž":"z","ẑ":"z","ʑ":"z","ⱬ":"z","ż":"z","ẓ":"z","ȥ":"z","ẕ":"z","ᵶ":"z","ᶎ":"z","ʐ":"z","ƶ":"z","ɀ":"z","ﬀ":"ff","ﬃ":"ffi","ﬄ":"ffl","ﬁ":"fi","ﬂ":"fl","ĳ":"ij","œ":"oe","ﬆ":"st","ₐ":"a","ₑ":"e","ᵢ":"i","ⱼ":"j","ₒ":"o","ᵣ":"r","ᵤ":"u","ᵥ":"v","ₓ":"x"};
String.prototype.latinise=function(){return this.replace(/[^A-Za-z0-9\[\] ]/g,function(a){return Latinise.latin_map[a]||a;});};
String.prototype.latinize=String.prototype.latinise;

//fonction qui calcule le poids d'un enregistrement vis a vis d'un mot de la chaine demandée
function matchWord(word,idxWord,feature) {
	var dist = 0;
	
	var  tabFeatureLib =  cleanLib(feature.properties.LIBELLE).split(' ').filter(function(f){
		return (f.length>2 && f != 'LES' && f != 'DES');
		//return (f.length>2 && f != 'LES' && f != 'DES' && feature.properties.type == 'arret') || (f.length>3 && feature.properties.type != 'arret');
	});
	if (tabFeatureLib.indexOf(word) != -1) {// le mot existe
		if (findIgnore.indexOf(word)!=-1) {//mot a quasi ignorer
			dist = 1;
		} else {//match exact
			dist = 10;
		}
	} else {//match partiel et levenstein
		if(feature.properties.type == 'arret' || word.length >= 4) {//les mots de 3 lettre seulement pour les arrets
			var minD = 99;
			var partial = false;
			var dMaxPartial = 0;
			tabFeatureLib.forEach(function(f){
				if (findIgnore.indexOf(f)!=-1) return;
				
				var d = levenshtein(f,word);
				if (d < minD && d <= maxLevDist) {
					minD = d;
				}
				partial = partial||(f.indexOf(word)!=-1);
				var dPartial = Math.round(((f.length-word.length)/f.length)*10);
				if (partial && dPartial > dMaxPartial) {
					dMaxPartial = dPartial;
				}
			});
			/*if (minD != 99) {//on a un levenstein : 10 - la distance
				dist = 10 - minD;
			} else if (partial) {// match partiel dans un des mots : proportion du mot exacte en 10eme
				dist = dMaxPartial;
			}*/
			dist = Math.max(10 - minD,dMaxPartial);
		}
	}
	var distCommune = 0
	//match de la commune
	if (feature.properties.COMMUNE!='') {
		if (feature.properties.COMMUNE.indexOf(word) != -1) {// match exact
			distCommune = 10;
		} else {//match partiel et levenstein
			if(feature.properties.type == 'arret' || word.length >= 4) {//les mots de 3 lettre seulement pour les arrets
				var minD = 99;
				var partial = false;
				var dMaxPartial = 0;
				var f = feature.properties.COMMUNE;
				
				var d = levenshtein(f,word);
				if (d < minD && d <= maxLevDist) {
					minD = d;
				}
				partial = partial||(f.indexOf(word)!=-1);
				var dPartial = Math.round(((f.length-word.length)/f.length)*10);
				if (partial && dPartial > dMaxPartial) {
					dMaxPartial = dPartial;
				}
				
				/*if (minD != 99) {//on a un levenstein : 10 - la distance
					distCommune= 10 - minD;
				} else if (partial) {// match partiel dans un des mots : proportion du mot exacte en 10eme
					distCommune= dMaxPartial;
				}*/
				distCommune = Math.max(10 - minD,dMaxPartial);
			}
		}
	}
	return {dist:dist,distCommune:distCommune};
}

function cleanLib(lib) {
	return lib.toUpperCase().latinize().replace('-',' ').replace(',',' ').replace('\'',' ');
}

//**************************************//
// levenshtein
//**************************************//
//http://www.merriampark.com/ld.htm, http://www.mgilleland.com/ld/ldjavascript.htm, Damerau–Levenshtein distance (Wikipedia)
function levenshtein(s, t) {
    var d = []; //2d matrix

    // Step 1
    var n = s.length;
    var m = t.length;

    if (n == 0) return m;
    if (m == 0) return n;

    //Create an array of arrays in javascript (a descending loop is quicker)
    for (var i = n; i >= 0; i--) d[i] = [];

    // Step 2
    for (var i = n; i >= 0; i--) d[i][0] = i;
    for (var j = m; j >= 0; j--) d[0][j] = j;

    // Step 3
    for (var i = 1; i <= n; i++) {
        var s_i = s.charAt(i - 1);

        // Step 4
        for (var j = 1; j <= m; j++) {

            //Check the jagged ld total so far
            if (i == j && d[i][j] > 4) return n;

            var t_j = t.charAt(j - 1);
            var cost = (s_i == t_j) ? 0 : 1; // Step 5

            //Calculate the minimum
            var mi = d[i - 1][j] + 1;
            var b = d[i][j - 1] + 1;
            var c = d[i - 1][j - 1] + cost;

            if (b < mi) mi = b;
            if (c < mi) mi = c;

            d[i][j] = mi; // Step 6

            //Damerau transposition
            if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
            }
        }
    }

    // Step 7
    return d[n][m];
}

function parseAxes(xml) {
	xml.Racine.Axe.forEach(function (a,index){
		a.Direction.forEach(function (d,index){
			var f = {properties:{type:'axe'}};
			f.properties.axe = a.$.Nom;
			f.properties.direction = d.$.Nom;
			f.properties.LIBELLE = a.$.Nom.replace(' ','')+' direction '+d.$.Nom;
			f.properties.COMMUNE='';
			var liste=[];
			var noms=[];
			d.Echangeur.forEach(function (e,index){
				noms.push(e.$.Nom);
				liste.push(e.$.Sortie);
			});
			f.properties.sorties = liste.join(';');
			f.properties.noms = noms.join(';');
			global.findText.features.push(f);
		});
	});
	console.log('axes loaded.');
	
}
