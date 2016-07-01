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

// module principal qui appelle les autres en fonction du fichier config.json

var koa = require('koa');
var gzip = require('koa-gzip');
var route = require('koa-route');
var jsonp = require('koa-jsonp');
var request = require('koa-request');
var cors = require('koa-cors');
var querystring = require('querystring');
var co = require('co');
var fs = require('fs');

var EventEmitter = require("events").EventEmitter;
exports.eventEmitter = new EventEmitter();

var config={};

global.debug=false;
global.plugins={"types":{}, "name": {}};

exports.isDebug = function(){return global.debug;}
exports.setDebug = function(bDebug){global.debug = bDebug; console.log('Debug is now '+(bDebug?'on':'off'));}
exports.getConfig = function() { return config;}
exports.dumpError = function(err,caller) {return dumpError(err,caller);}

try {
	var f = fs.readFileSync('config.json', 'utf8');
	parseConfig(f);

	co(function *(){
		// init des plugins
		for(var p in config.plugins) {
			if(global.plugins.name[p].init) yield global.plugins.name[p].init(config);
		}

		console.log('Fin du chargement des donnees statiques');
		var app = koa();

		var options = {
			origin: true,
			methods: 'GET,HEAD,PUT,POST,DELETE',
			expose: ['MM-STOPTIMES-STATUS']
		}
		app.use(cors(options));
		app.use(gzip());
		app.use(jsonp());

		//init des url koa
		for(var p in config.plugins) {
			if(global.plugins.name[p].initKoa) global.plugins.name[p].initKoa(app,route);
		}
		
		// all other routes
		app.use(function *() {
			this.body = 'Oups !';
		});
		app.on('error', function(err, ctx){
		  log.error('server error', err, ctx);
		});
		var server = app.listen(config.port, function() {
			console.log('Listening on http://localhost:'+config.port);
		});
		// envoi de données de test
		if(process.argv[2] === 'test') {
			console.log('---Test mode START');
			for(var p in config.plugins) {
				if(global.plugins.name[p].initTest) global.plugins.name[p].initTest(config);
			}
			console.log('---Test mode END');
		}
	}).catch(dumpError);
	
} catch(e) {
	dumpError(e,'main');
}

function parseConfig(data) {
	try {
		config = JSON.parse(data);
		
		if( typeof(config.port)=='undefined') throw {message :'no port field in config.json'};
		if( typeof(config.portDyn)=='undefined') throw {message :'no dyn port field in config.json'};
		if( typeof(config.portRT)=='undefined') throw {message :'no rt port field in config.json'};
		
		config.types={};
		
		initPlugins(config);
	} catch(e) {
		dumpError(e,'config.json');
	}
}

function dumpError(err,caller) {
  if (typeof err === 'object') {
    if (err.message) {
      console.log('\n'+(caller?caller+' : ':'')+'Message : ' + err.message);
    }
    if (err.stack) {
      console.log('\nStacktrace:');
      console.log('====================');
      console.log(err.stack);
    }
  } else {
    console.log('dumpError :: argument is not an object');
  }
}

function initPlugins(config) {
	for(var p in config.plugins) {
		global.plugins.name[p] = require('./' + p);
		for(var t in config.plugins[p].types)
			global.plugins.types[config.plugins[p].types[t]] = global.plugins.name[p];
	}
}