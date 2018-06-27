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

// module de distribution des geometries des lignes de transport en commun

var fs = require('fs');
var main = require('./index');
var querystring = require('querystring');
const Joi = require('koa-joi-router').Joi;

var dyn = require('./dynWs');
var polyline = require('./polyline');

global.saisie={municipality:[],street:[],tarifZonePeuDense:{}};

var Latinise={};Latinise.latin_map={"Á":"A","Ă":"A","Ắ":"A","Ặ":"A","Ằ":"A","Ẳ":"A","Ẵ":"A","Ǎ":"A","Â":"A","Ấ":"A","Ậ":"A","Ầ":"A","Ẩ":"A","Ẫ":"A","Ä":"A","Ǟ":"A","Ȧ":"A","Ǡ":"A","Ạ":"A","Ȁ":"A","À":"A","Ả":"A","Ȃ":"A","Ā":"A","Ą":"A","Å":"A","Ǻ":"A","Ḁ":"A","Ⱥ":"A","Ã":"A","Ꜳ":"AA","Æ":"AE","Ǽ":"AE","Ǣ":"AE","Ꜵ":"AO","Ꜷ":"AU","Ꜹ":"AV","Ꜻ":"AV","Ꜽ":"AY","Ḃ":"B","Ḅ":"B","Ɓ":"B","Ḇ":"B","Ƀ":"B","Ƃ":"B","Ć":"C","Č":"C","Ç":"C","Ḉ":"C","Ĉ":"C","Ċ":"C","Ƈ":"C","Ȼ":"C","Ď":"D","Ḑ":"D","Ḓ":"D","Ḋ":"D","Ḍ":"D","Ɗ":"D","Ḏ":"D","ǲ":"D","ǅ":"D","Đ":"D","Ƌ":"D","Ǳ":"DZ","Ǆ":"DZ","É":"E","Ĕ":"E","Ě":"E","Ȩ":"E","Ḝ":"E","Ê":"E","Ế":"E","Ệ":"E","Ề":"E","Ể":"E","Ễ":"E","Ḙ":"E","Ë":"E","Ė":"E","Ẹ":"E","Ȅ":"E","È":"E","Ẻ":"E","Ȇ":"E","Ē":"E","Ḗ":"E","Ḕ":"E","Ę":"E","Ɇ":"E","Ẽ":"E","Ḛ":"E","Ꝫ":"ET","Ḟ":"F","Ƒ":"F","Ǵ":"G","Ğ":"G","Ǧ":"G","Ģ":"G","Ĝ":"G","Ġ":"G","Ɠ":"G","Ḡ":"G","Ǥ":"G","Ḫ":"H","Ȟ":"H","Ḩ":"H","Ĥ":"H","Ⱨ":"H","Ḧ":"H","Ḣ":"H","Ḥ":"H","Ħ":"H","Í":"I","Ĭ":"I","Ǐ":"I","Î":"I","Ï":"I","Ḯ":"I","İ":"I","Ị":"I","Ȉ":"I","Ì":"I","Ỉ":"I","Ȋ":"I","Ī":"I","Į":"I","Ɨ":"I","Ĩ":"I","Ḭ":"I","Ꝺ":"D","Ꝼ":"F","Ᵹ":"G","Ꞃ":"R","Ꞅ":"S","Ꞇ":"T","Ꝭ":"IS","Ĵ":"J","Ɉ":"J","Ḱ":"K","Ǩ":"K","Ķ":"K","Ⱪ":"K","Ꝃ":"K","Ḳ":"K","Ƙ":"K","Ḵ":"K","Ꝁ":"K","Ꝅ":"K","Ĺ":"L","Ƚ":"L","Ľ":"L","Ļ":"L","Ḽ":"L","Ḷ":"L","Ḹ":"L","Ⱡ":"L","Ꝉ":"L","Ḻ":"L","Ŀ":"L","Ɫ":"L","ǈ":"L","Ł":"L","Ǉ":"LJ","Ḿ":"M","Ṁ":"M","Ṃ":"M","Ɱ":"M","Ń":"N","Ň":"N","Ņ":"N","Ṋ":"N","Ṅ":"N","Ṇ":"N","Ǹ":"N","Ɲ":"N","Ṉ":"N","Ƞ":"N","ǋ":"N","Ñ":"N","Ǌ":"NJ","Ó":"O","Ŏ":"O","Ǒ":"O","Ô":"O","Ố":"O","Ộ":"O","Ồ":"O","Ổ":"O","Ỗ":"O","Ö":"O","Ȫ":"O","Ȯ":"O","Ȱ":"O","Ọ":"O","Ő":"O","Ȍ":"O","Ò":"O","Ỏ":"O","Ơ":"O","Ớ":"O","Ợ":"O","Ờ":"O","Ở":"O","Ỡ":"O","Ȏ":"O","Ꝋ":"O","Ꝍ":"O","Ō":"O","Ṓ":"O","Ṑ":"O","Ɵ":"O","Ǫ":"O","Ǭ":"O","Ø":"O","Ǿ":"O","Õ":"O","Ṍ":"O","Ṏ":"O","Ȭ":"O","Ƣ":"OI","Ꝏ":"OO","Ɛ":"E","Ɔ":"O","Ȣ":"OU","Ṕ":"P","Ṗ":"P","Ꝓ":"P","Ƥ":"P","Ꝕ":"P","Ᵽ":"P","Ꝑ":"P","Ꝙ":"Q","Ꝗ":"Q","Ŕ":"R","Ř":"R","Ŗ":"R","Ṙ":"R","Ṛ":"R","Ṝ":"R","Ȑ":"R","Ȓ":"R","Ṟ":"R","Ɍ":"R","Ɽ":"R","Ꜿ":"C","Ǝ":"E","Ś":"S","Ṥ":"S","Š":"S","Ṧ":"S","Ş":"S","Ŝ":"S","Ș":"S","Ṡ":"S","Ṣ":"S","Ṩ":"S","Ť":"T","Ţ":"T","Ṱ":"T","Ț":"T","Ⱦ":"T","Ṫ":"T","Ṭ":"T","Ƭ":"T","Ṯ":"T","Ʈ":"T","Ŧ":"T","Ɐ":"A","Ꞁ":"L","Ɯ":"M","Ʌ":"V","Ꜩ":"TZ","Ú":"U","Ŭ":"U","Ǔ":"U","Û":"U","Ṷ":"U","Ü":"U","Ǘ":"U","Ǚ":"U","Ǜ":"U","Ǖ":"U","Ṳ":"U","Ụ":"U","Ű":"U","Ȕ":"U","Ù":"U","Ủ":"U","Ư":"U","Ứ":"U","Ự":"U","Ừ":"U","Ử":"U","Ữ":"U","Ȗ":"U","Ū":"U","Ṻ":"U","Ų":"U","Ů":"U","Ũ":"U","Ṹ":"U","Ṵ":"U","Ꝟ":"V","Ṿ":"V","Ʋ":"V","Ṽ":"V","Ꝡ":"VY","Ẃ":"W","Ŵ":"W","Ẅ":"W","Ẇ":"W","Ẉ":"W","Ẁ":"W","Ⱳ":"W","Ẍ":"X","Ẋ":"X","Ý":"Y","Ŷ":"Y","Ÿ":"Y","Ẏ":"Y","Ỵ":"Y","Ỳ":"Y","Ƴ":"Y","Ỷ":"Y","Ỿ":"Y","Ȳ":"Y","Ɏ":"Y","Ỹ":"Y","Ź":"Z","Ž":"Z","Ẑ":"Z","Ⱬ":"Z","Ż":"Z","Ẓ":"Z","Ȥ":"Z","Ẕ":"Z","Ƶ":"Z","Ĳ":"IJ","Œ":"OE","ᴀ":"A","ᴁ":"AE","ʙ":"B","ᴃ":"B","ᴄ":"C","ᴅ":"D","ᴇ":"E","ꜰ":"F","ɢ":"G","ʛ":"G","ʜ":"H","ɪ":"I","ʁ":"R","ᴊ":"J","ᴋ":"K","ʟ":"L","ᴌ":"L","ᴍ":"M","ɴ":"N","ᴏ":"O","ɶ":"OE","ᴐ":"O","ᴕ":"OU","ᴘ":"P","ʀ":"R","ᴎ":"N","ᴙ":"R","ꜱ":"S","ᴛ":"T","ⱻ":"E","ᴚ":"R","ᴜ":"U","ᴠ":"V","ᴡ":"W","ʏ":"Y","ᴢ":"Z","á":"a","ă":"a","ắ":"a","ặ":"a","ằ":"a","ẳ":"a","ẵ":"a","ǎ":"a","â":"a","ấ":"a","ậ":"a","ầ":"a","ẩ":"a","ẫ":"a","ä":"a","ǟ":"a","ȧ":"a","ǡ":"a","ạ":"a","ȁ":"a","à":"a","ả":"a","ȃ":"a","ā":"a","ą":"a","ᶏ":"a","ẚ":"a","å":"a","ǻ":"a","ḁ":"a","ⱥ":"a","ã":"a","ꜳ":"aa","æ":"ae","ǽ":"ae","ǣ":"ae","ꜵ":"ao","ꜷ":"au","ꜹ":"av","ꜻ":"av","ꜽ":"ay","ḃ":"b","ḅ":"b","ɓ":"b","ḇ":"b","ᵬ":"b","ᶀ":"b","ƀ":"b","ƃ":"b","ɵ":"o","ć":"c","č":"c","ç":"c","ḉ":"c","ĉ":"c","ɕ":"c","ċ":"c","ƈ":"c","ȼ":"c","ď":"d","ḑ":"d","ḓ":"d","ȡ":"d","ḋ":"d","ḍ":"d","ɗ":"d","ᶑ":"d","ḏ":"d","ᵭ":"d","ᶁ":"d","đ":"d","ɖ":"d","ƌ":"d","ı":"i","ȷ":"j","ɟ":"j","ʄ":"j","ǳ":"dz","ǆ":"dz","é":"e","ĕ":"e","ě":"e","ȩ":"e","ḝ":"e","ê":"e","ế":"e","ệ":"e","ề":"e","ể":"e","ễ":"e","ḙ":"e","ë":"e","ė":"e","ẹ":"e","ȅ":"e","è":"e","ẻ":"e","ȇ":"e","ē":"e","ḗ":"e","ḕ":"e","ⱸ":"e","ę":"e","ᶒ":"e","ɇ":"e","ẽ":"e","ḛ":"e","ꝫ":"et","ḟ":"f","ƒ":"f","ᵮ":"f","ᶂ":"f","ǵ":"g","ğ":"g","ǧ":"g","ģ":"g","ĝ":"g","ġ":"g","ɠ":"g","ḡ":"g","ᶃ":"g","ǥ":"g","ḫ":"h","ȟ":"h","ḩ":"h","ĥ":"h","ⱨ":"h","ḧ":"h","ḣ":"h","ḥ":"h","ɦ":"h","ẖ":"h","ħ":"h","ƕ":"hv","í":"i","ĭ":"i","ǐ":"i","î":"i","ï":"i","ḯ":"i","ị":"i","ȉ":"i","ì":"i","ỉ":"i","ȋ":"i","ī":"i","į":"i","ᶖ":"i","ɨ":"i","ĩ":"i","ḭ":"i","ꝺ":"d","ꝼ":"f","ᵹ":"g","ꞃ":"r","ꞅ":"s","ꞇ":"t","ꝭ":"is","ǰ":"j","ĵ":"j","ʝ":"j","ɉ":"j","ḱ":"k","ǩ":"k","ķ":"k","ⱪ":"k","ꝃ":"k","ḳ":"k","ƙ":"k","ḵ":"k","ᶄ":"k","ꝁ":"k","ꝅ":"k","ĺ":"l","ƚ":"l","ɬ":"l","ľ":"l","ļ":"l","ḽ":"l","ȴ":"l","ḷ":"l","ḹ":"l","ⱡ":"l","ꝉ":"l","ḻ":"l","ŀ":"l","ɫ":"l","ᶅ":"l","ɭ":"l","ł":"l","ǉ":"lj","ſ":"s","ẜ":"s","ẛ":"s","ẝ":"s","ḿ":"m","ṁ":"m","ṃ":"m","ɱ":"m","ᵯ":"m","ᶆ":"m","ń":"n","ň":"n","ņ":"n","ṋ":"n","ȵ":"n","ṅ":"n","ṇ":"n","ǹ":"n","ɲ":"n","ṉ":"n","ƞ":"n","ᵰ":"n","ᶇ":"n","ɳ":"n","ñ":"n","ǌ":"nj","ó":"o","ŏ":"o","ǒ":"o","ô":"o","ố":"o","ộ":"o","ồ":"o","ổ":"o","ỗ":"o","ö":"o","ȫ":"o","ȯ":"o","ȱ":"o","ọ":"o","ő":"o","ȍ":"o","ò":"o","ỏ":"o","ơ":"o","ớ":"o","ợ":"o","ờ":"o","ở":"o","ỡ":"o","ȏ":"o","ꝋ":"o","ꝍ":"o","ⱺ":"o","ō":"o","ṓ":"o","ṑ":"o","ǫ":"o","ǭ":"o","ø":"o","ǿ":"o","õ":"o","ṍ":"o","ṏ":"o","ȭ":"o","ƣ":"oi","ꝏ":"oo","ɛ":"e","ᶓ":"e","ɔ":"o","ᶗ":"o","ȣ":"ou","ṕ":"p","ṗ":"p","ꝓ":"p","ƥ":"p","ᵱ":"p","ᶈ":"p","ꝕ":"p","ᵽ":"p","ꝑ":"p","ꝙ":"q","ʠ":"q","ɋ":"q","ꝗ":"q","ŕ":"r","ř":"r","ŗ":"r","ṙ":"r","ṛ":"r","ṝ":"r","ȑ":"r","ɾ":"r","ᵳ":"r","ȓ":"r","ṟ":"r","ɼ":"r","ᵲ":"r","ᶉ":"r","ɍ":"r","ɽ":"r","ↄ":"c","ꜿ":"c","ɘ":"e","ɿ":"r","ś":"s","ṥ":"s","š":"s","ṧ":"s","ş":"s","ŝ":"s","ș":"s","ṡ":"s","ṣ":"s","ṩ":"s","ʂ":"s","ᵴ":"s","ᶊ":"s","ȿ":"s","ɡ":"g","ᴑ":"o","ᴓ":"o","ᴝ":"u","ť":"t","ţ":"t","ṱ":"t","ț":"t","ȶ":"t","ẗ":"t","ⱦ":"t","ṫ":"t","ṭ":"t","ƭ":"t","ṯ":"t","ᵵ":"t","ƫ":"t","ʈ":"t","ŧ":"t","ᵺ":"th","ɐ":"a","ᴂ":"ae","ǝ":"e","ᵷ":"g","ɥ":"h","ʮ":"h","ʯ":"h","ᴉ":"i","ʞ":"k","ꞁ":"l","ɯ":"m","ɰ":"m","ᴔ":"oe","ɹ":"r","ɻ":"r","ɺ":"r","ⱹ":"r","ʇ":"t","ʌ":"v","ʍ":"w","ʎ":"y","ꜩ":"tz","ú":"u","ŭ":"u","ǔ":"u","û":"u","ṷ":"u","ü":"u","ǘ":"u","ǚ":"u","ǜ":"u","ǖ":"u","ṳ":"u","ụ":"u","ű":"u","ȕ":"u","ù":"u","ủ":"u","ư":"u","ứ":"u","ự":"u","ừ":"u","ử":"u","ữ":"u","ȗ":"u","ū":"u","ṻ":"u","ų":"u","ᶙ":"u","ů":"u","ũ":"u","ṹ":"u","ṵ":"u","ᵫ":"ue","ꝸ":"um","ⱴ":"v","ꝟ":"v","ṿ":"v","ʋ":"v","ᶌ":"v","ⱱ":"v","ṽ":"v","ꝡ":"vy","ẃ":"w","ŵ":"w","ẅ":"w","ẇ":"w","ẉ":"w","ẁ":"w","ⱳ":"w","ẘ":"w","ẍ":"x","ẋ":"x","ᶍ":"x","ý":"y","ŷ":"y","ÿ":"y","ẏ":"y","ỵ":"y","ỳ":"y","ƴ":"y","ỷ":"y","ỿ":"y","ȳ":"y","ẙ":"y","ɏ":"y","ỹ":"y","ź":"z","ž":"z","ẑ":"z","ʑ":"z","ⱬ":"z","ż":"z","ẓ":"z","ȥ":"z","ẕ":"z","ᵶ":"z","ᶎ":"z","ʐ":"z","ƶ":"z","ɀ":"z","ﬀ":"ff","ﬃ":"ffi","ﬄ":"ffl","ﬁ":"fi","ﬂ":"fl","ĳ":"ij","œ":"oe","ﬆ":"st","ₐ":"a","ₑ":"e","ᵢ":"i","ⱼ":"j","ₒ":"o","ᵣ":"r","ᵤ":"u","ᵥ":"v","ₓ":"x"};
String.prototype.latinise=function(){return this.replace(/[^A-Za-z0-9\[\] ]/g,function(a){return Latinise.latin_map[a]||a;});};
String.prototype.latinize=String.prototype.latinise;

var tabCommunes = [
	'Bresson',
	'Brié-et-Angonnes',
	'Champagnier',
	'Champ-sur-Drac',
	'Claix',
	'Corenc',
	'Domène',
	'Échirolles',
	'Eybens',
	'Fontaine',
	'Fontanil-Cornillon',
	'Gières',
	'Grenoble',
	'Herbeys',
	'Jarrie',
	'Le Gua',
	'Le Pont-de-Claix',
	'Meylan',
	'Miribel-Lanchâtre',
	'Mont-Saint-Martin',
	'Murianette',
	'Notre-Dame-de-Mésage',
	'Montchaboud',
	'Notre-Dame-de-Commiers',
	'Noyarey',
	'Proveysieux',
	'Poisat',
	'Quaix-en-Chartreuse',
	'Sarcenas',
	'Sassenage',
	'Séchilienne',
	'Seyssins',
	'Seyssinet-Pariset',
	'Saint-Barthélemy-de-Séchilienne',
	'Saint-Égrève',
	'Saint-Georges-de-Commiers',
	'Saint-Martin-le-Vinoux',
	'Saint-Martin-d\'Hères',
	'Saint-Paul-de-Varces',
	'Saint-Pierre-de-Mésage',
	'La Tronche',
	'Le Sappey-en-Chartreuse',
	'Vaulnaveys-le-Bas',
	'Vaulnaveys-le-Haut',
	'Venon',
	'Vif',
	'Vizille',
	'Veurey-Voroize',
	'Varces-Allières-et-Risset'
];

exports.routes = [
	{
		method: 'get',
		path: '/api/find/city/json',
		handler: findCity,
		meta:{
			description:'Recherche de ville dans la base adresse nationnale.'
		},
		groupName: 'Outils',
		cors:true,
		validate:{
			query:{
				query:Joi.string().alphanum()
			}
		}
	},
	{
		method: 'get',
		path: '/api/find/street/json',
		handler: findStreet,
		meta:{
			description:'Recherche de rue dans la base adresse nationnale.'
		},
		groupName: 'Outils',
		cors:true,
		validate:{
			query:{
				saisie:Joi.string(),
				city:Joi.string().alphanum()
			}
		}
	}
];

exports.init = async function (config) {
	
	console.log('Début d initialisation des zones tarifaires');
	//Fichier zone peu dence
	var file = config.plugins.saisie.fileZonePeuDence;
	var tarifZonePeuDense = fs.readFileSync(config.dataPath+file, 'utf8');
	global.saisie.tarifZonePeuDense = JSON.parse(tarifZonePeuDense).features;
	
	//Construction d'un objet pour acceder rapidement aux adresses en zone peu dense
	//le code de l'objet : rue_codepostal_ville_numero
	var tarifZonePeuDenseObj = {};
	for (var i=0;i<global.saisie.tarifZonePeuDense.length;i++){
		var ad = global.saisie.tarifZonePeuDense[i].properties;
		tarifZonePeuDenseObj[ad.street+'_'+ad.postcode+'_'+ad.city+'_'+ad.number]=true;
	}

	//console.log(global.saisie.tarifZonePeuDense);
	//Fichier adresses globales
	file = config.plugins.saisie.file;
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var linesBAN = data.split('\n');
	var curseur = 0;
	var trouve = 0;
	
	var before = new Date().getTime();
	for(var i =0;i<linesBAN.length ;i++) {
		if(linesBAN[i].substr(0,1)!='{') continue;
		var addr = JSON.parse(linesBAN[i]);
		
		if(addr.type=='municipality' && tabCommunes.indexOf(addr.name)!=-1)  { //C'est une ville
			delete addr.context;
			delete addr.x;
			delete addr.y;
			global.saisie.municipality.push(addr);			
		} else if(addr.housenumbers && tabCommunes.indexOf(addr.city)!=-1) { //C'est une rue
		
			for(var num in addr.housenumbers) {
				addr.housenumbers[num]['tarifZonePeuDense'] = 0;
				if(!!tarifZonePeuDenseObj[addr.name+'_'+addr.postcode+'_'+addr.city+'_'+num]) {
					addr.housenumbers[num]['tarifZonePeuDense'] = 1;
					trouve++;
				}
			};
			/*
			for(var num in addr.housenumbers) {//rajoute l'info si eligible ---> Gros probleme de performance... 1mn35' et 16121 enregistrements
				//console.log(num);
				addr.housenumbers[num]['tarifZonePeuDense'] = 0;
				for(var tarifZonePeuDense in global.saisie.tarifZonePeuDense) { //
					var s = global.saisie.tarifZonePeuDense[tarifZonePeuDense].properties;
					if ((s.street == addr.name) && (s.postcode == addr.postcode) && (s.city== addr.city) && (s.number == num)) {
							addr.housenumbers[num]['tarifZonePeuDense'] = 1;
							trouve++;
							break;
					}
				}					
			};
			*/
			/*
			for(var num in addr.housenumbers) {//rajoute l'info si eligible ---> Moins gros probleme de performance mais resultat incomplet, il faudrait réorganiser les données... 24' et 16089 enregistrements
				addr.housenumbers[num]['tarifZonePeuDense'] = 0;
				
				for(var j = curseur; j < global.saisie.tarifZonePeuDense.length; j++) { //
					var s = global.saisie.tarifZonePeuDense[j].properties;
					if ((s.number == num) && ((s.street == addr.name) && (s.postcode == addr.postcode) && (s.city == addr.city))) {
						addr.housenumbers[num]['tarifZonePeuDense'] = 1;
						trouve++;
						curseur = j+1;
						break;
					}
				}				
			};*/
						
			delete addr.context;
			delete addr.x;
			delete addr.y;
			global.saisie.street.push(addr);			
		}
	}
	//Tris divers
	global.saisie.municipality.sort(function(a,b){
		return a.importance < b.importance;
	});
	var dif = new Date().getTime() - before;
	console.log('Duree du parse : ' + dif + 'ms');
	console.log('Fin d initialisation des zones tarifaires (' + trouve + '/16121) ');
	
}

function cleanLib(lib) {
	return lib.toUpperCase().latinize().replace('-',' ').replace(',',' ').replace('\'',' ');
}

//sasie de la commune ou du CP
//http://localhost:3000/api/find/city/json -> tous
//http://data.metromobilite.fr/api/find/city/json?query=toto
async function findCity(ctx) {
	try {
		
		var ret = global.saisie.municipality;
		var params = querystring.parse(decodeURIComponent(ctx.querystring));
		
		if (params['query']) {
			ret  = global.saisie.municipality.filter(function(f){
				var query = cleanLib(params['query']);
				var name = cleanLib(f.name);
				var postcode = f.postcode;
				
				if (name.indexOf(query)!=-1) return true;
				if (postcode.indexOf(query)!=-1) return true;
				
				return false;
			});
		}
		
		ctx.body = ret;
	} catch(e){
		dumpError(e,'saisie.findCity');
	}
}
//saisie de la rue (street ou locality)
//http://localhost:3000/api/find/street/json -> tous
//http://data.metromobilite.fr/api/find/street/json?saisie=gent&city=38120
//http://localhost:3000/api/find/street/json?saisie=gent&city=38120
async function findStreet(ctx) {
	try {
		
		var ret = global.saisie.street;
		var params = querystring.parse(decodeURIComponent(ctx.querystring));
		
		if (params['saisie'] && params['city']) {
			ret  = global.saisie.street.filter(function(f){
				var citySaisie = cleanLib(params['city']);
				var saisie = cleanLib(params['saisie']);
				
				var name = cleanLib(f.name);
				var city = cleanLib(f.city);
				var postcode = f.postcode;
				
				if ((citySaisie != city) && (citySaisie != postcode)) return false;
				if (name.indexOf(saisie)!=-1) return true;
					
				return false;
			});
		}			
		ctx.body = ret;
	} catch(e){
		dumpError(e,'saisie.findStreet');
	}
}