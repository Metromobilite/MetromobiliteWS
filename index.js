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

const Koa = require('koa');
const router = require('koa-joi-router');
const Joi = router.Joi;
const public = router();

var compress = require('koa-compress');
var jsonp = require('koa-jsonp');
var cors = require('@koa/cors');
var range = require('koa-range');

var docs = require('koa-docs');

var querystring = require('querystring');
var co = require('co');
var fs = require('fs');
var urlParse = require('url');

var EventEmitter = require("events").EventEmitter;
exports.eventEmitter = new EventEmitter();

var config={};

global.debug=false;
global.plugins={"types":{}, "name": {}};

exports.isDebug = function(){return global.debug;}
exports.setDebug = function(bDebug){global.debug = bDebug; console.log('Debug is now '+(bDebug?'on':'off'));}
exports.getConfig = function() { return config;}
exports.dumpError = function(err,caller) {return dumpError(err,caller);}

async function init(){
	try {
		var f = fs.readFileSync('config.json', 'utf8');
		parseConfig(f);

		
		// init des plugins
		for(var p in config.plugins) {
			if(global.plugins.name[p].init) await global.plugins.name[p].init(config);
		}

		console.log('Fin du chargement des donnees statiques');
		initKoaPublic();

		process.on('unhandledRejection', (reason, p) => {
			console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
			console.log(reason.stack);
			// application specific logging, throwing an error, or other logic here
		});

		// envoi de données de test
		if(process.argv[2] === 'test') {
			console.log('---Test mode START');
			for(var p in config.plugins) {
				if(global.plugins.name[p].initTest) global.plugins.name[p].initTest(config);
			}
			console.log('---Test mode END');
		}

	} catch(e) {
		dumpError(e,'main');
	}
}

function initKoaPublic() {
	var app = new Koa();
	app.use(async function (ctx, next) {
		try {
			await next();
		}
		catch (err) {
			ctx.status = err.status || 500;
			ctx.type = 'html';
			ctx.body = '<p>Erreur serveur.</p>';
			ctx.app.emit('error', err, ctx);
		}
	});
	app.use(compress({}));
	//en test cors pour tout le monde
	
	//aggregation des routes
	var routesCors = [];
	var routesNoCors = [];
	var groups = {};
	var allGroups = {};
	for (var p in config.plugins) {
		//routes externes
		if (global.plugins.name[p].routes) {
			for (var i = 0; i < global.plugins.name[p].routes.length; i++) {
				var rte = global.plugins.name[p].routes[i];
				if (!rte.cors) {
					routesNoCors.push(rte);
				}
				else {
					routesCors.push(rte);
				}
				var groupName = 'Autres';
				if (rte.groupName)
					groupName = rte.groupName;
				if (!allGroups[groupName])
					allGroups[groupName] = { groupName: groupName, routes: [] };
				allGroups[groupName].routes.push(rte);
				if (!rte.private) {
					if (!groups[groupName])
						groups[groupName] = { groupName: groupName, routes: [] };
					groups[groupName].routes.push(rte);
				}
			}
		}
		//routes internes d'injection de données
		if (global.plugins.name[p].dynRoutes) {
			for (var i = 0; i < global.plugins.name[p].dynRoutes.length; i++) {
				var rte = global.plugins.name[p].dynRoutes[i];
				var groupName = 'Autres';
				if (rte.groupName)
					groupName = rte.groupName;
				if (!allGroups[groupName])
					allGroups[groupName] = { groupName: groupName, routes: [] };
				allGroups[groupName].routes.push(rte);
			}
		}
	}
	
	//doc complete
	var docFullOptions = {
		title: 'API M Full',
		version: '1.0.0',
		theme: 'cyborg',
		routeHandlers: 'collapsed',
		groups: []
	};
	for (var grp in allGroups) {
		docFullOptions.groups.push(allGroups[grp]);
	}
	app.use(docs.get('/docs', docFullOptions));
	
	//doc utilisateurs
	var docOptions = {
		title: 'API Metromobilité',
		version: '1.0.0',
		theme: 'cyborg',
		routeHandlers: 'disabled',
		groups: []
	};
	for (var grp in groups) {
		docOptions.groups.push(groups[grp]);
	}
	app.use(docs.get('/api/docs', docOptions));
	
	//ws restreints a certaines url
	var restrictedOptions = {
		origin: getCorsOrigin,
		allowMethods: 'GET,HEAD,PUT,POST,DELETE',
		exposeHeaders: ['MM-STOPTIMES-STATUS']
	};
	app.use(cors(restrictedOptions));
	
	//init des url koa
	app.use(range);
	public.route(routesNoCors);

	//ws non restreints
	app.use(jsonp());
	var options = {
		allowMethods: 'GET,HEAD,PUT,POST,DELETE',
		exposeHeaders: ['MM-STOPTIMES-STATUS']
	};
	app.use(cors(options));
	//init des middleware specifiques
	for (var p in config.plugins) {
		if (global.plugins.name[p].initMiddleware)
			global.plugins.name[p].initMiddleware(app);
	}
	public.route(routesCors);
	app.use(public.middleware());
	
	//console.log(public.routes);

	// si on a pas trouvé de route correspondante
	app.use(async (ctx) => {
		ctx.body = 'Oups !';
	});
	app.on('error', function (err, ctx) {
		console.error('server error', err, ctx);
	});
	var server = app.listen(config.port, function () {
		console.log('Listening on http://localhost:' + config.port);
	});
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
		console.error((caller?caller+' : ':'')+'Message : ' + err.message);
		}
		if (exports.isDebug() && err.stack) {
		console.error('\nStacktrace:');
		console.error('====================');
		console.error(err.stack);
		}
  	} else {
		console.error('dumpError :: argument is not an object : '+ err);
  	}
}

function initPlugins(config) {
	for(var p in config.plugins) {
		global.plugins.name[p] = require('./' + p);
		for(var t in config.plugins[p].types)
			global.plugins.types[config.plugins[p].types[t]] = global.plugins.name[p];
	}
}
function getCorsOrigin(ctx){
	var restrictedEndPoints = config.restrictedEndPoints;
	var allowedOrigins = config.allowedOrigins;
	if (process.argv[2] === 'test') return '*';
	var e, bRestrited = false;
	for (var i = 0; i < restrictedEndPoints.length; ++i) {
		e = restrictedEndPoints[i];
		if (e === ctx.url.substring(0, e.length)) {
			bRestrited = true;
			break;
		}
	}
	var a, bAllowed = false;
	if(bRestrited) {
		var originHostname = urlParse.parse(ctx.header.origin).hostname;
		for (var i = 0; i < allowedOrigins.length; ++i) {
			a = allowedOrigins[i];
			if (originHostname.endsWith(a)) {
				bAllowed = true;
				break;
			}
		}
	}
	return ((!bRestrited || bAllowed)?'*':false);
}
init();