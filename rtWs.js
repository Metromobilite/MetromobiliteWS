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

// module de communication avec la page expoit.html de visualisation des données dynamiques presentes dans le webservice

var Koa = require('koa');
var app = new Koa();
var cors = require('@koa/cors');
var send = require('koa-send');
var main = require('./index');
var otpHoraires = require('./otpHoraires');
var config;

var options = {
	allowMethods: 'GET,HEAD,PUT,POST,DELETE'
}

app.use(cors(options));

app.use(async (ctx) => {
	await send(ctx, ctx.path, { root: __dirname + '/exploit' });
});

var server = require('http').createServer(app.callback());
var io = require('socket.io')(server,{ serveClient: true });

main.eventEmitter.on('updateDynData', function (evt) {
	io.emit('update'+evt.type, evt.data);
});

main.eventEmitter.on('changeEtatServeur', function (data) {
	io.emit('updateetatsServeursHoraires', data);
});
main.eventEmitter.on('changeEtatGtfsRt', function (data) {
	io.emit('updateetatGtfsRt', data);
});
main.eventEmitter.on('liaisonsServeurs', function (data) {
	io.emit('updateliaisonsServeurs', data);
});


io.on('connection', function(socket){
	console.log('socket connected');

	socket.once('disconnect', function () {
		console.log('socket disconnected');
	});
	socket.emit('connect', 'Connecté !');

	socket.emit('debug', {bDebug:main.isDebug()});
	socket.emit('SEMGTFSActif', {bActif:global.etatsServeurs.SEMGTFSActif});
	socket.emit('forceTotemAtmo', {forceValue:global.totemAtmo.forceValue});

	socket.on('getAll', function(type){
		var res;
		if(type=='liaisonsServeurs') {
			res = {serveur:'tous',etat:global.liaisonsServeurs};
		} else if(type=='etatsServeursHoraires') {
			res = otpHoraires.getEtatsServeurs();
		} else {
			res = (global.dyn[type]?global.dyn[type]:{});
		}
		socket.emit('update'+type, res);
	});
	socket.on('setDebug',function(debug){
		main.setDebug(debug==true);
		socket.broadcast.emit('debug', {bDebug:main.isDebug()});
	});
	socket.on('setSEMGTFSActif',function(bActif){
		global.etatsServeurs.SEMGTFSActif=(bActif==true);
		socket.broadcast.emit('SEMGTFSActif', {bActif:global.etatsServeurs.SEMGTFSActif});
	});
	socket.on('setForceTotemAtmo',function(valeur){
		if(global.plugins.name['totemAtmo'] && global.plugins.name['totemAtmo'].forceValeur){
			global.plugins.name['totemAtmo'].forceValeur(valeur);
		}
		io.emit('forceTotemAtmo', {forceValue:global.totemAtmo.forceValue});
	});
	
	
});

exports.init = async function (config) {
	server.listen(config.portRT, function() {
		console.log('Listening on http://localhost:'+config.portRT);
	});
};

/*exports.updateType = function(type,data) {
	io.emit('update'+type, data);
};*/
