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

var app = require('koa')();
var cors = require('koa-cors');
var send = require('koa-send');
var main = require('./index');
var otpHoraires = require('./otpHoraires');
var config;

var options = {
	origin: true,
	methods: 'GET,HEAD,PUT,POST,DELETE'
}

app.use(cors(options));

app.use(function *(){
  yield send(this, this.path, { root: __dirname + '/exploit' });
});
var server = require('http').createServer(app.callback());
var io = require('socket.io')(server,{ serveClient: true });

main.eventEmitter.on('updateDynData', function (evt) {
	io.emit('update'+evt.type, evt.data);
});

main.eventEmitter.on('changeEtatServeur', function (data) {
	io.emit('updateetatsServeursHoraires', data);
});

io.on('connection', function(socket){
	console.log('socket connected');

	socket.once('disconnect', function () {
		console.log('socket disconnected');
	});
	io.emit('connect', 'Connecté !');

	var data = {bDebug:main.isDebug()};
	io.emit('debug', data);


	socket.on('getAll', function(type){
		var res;
		if(type=='etatsServeursHoraires') {
			res = otpHoraires.getEtatsServeurs();
		} else {
			res = (global.dyn[type]?global.dyn[type]:{});
		}
		io.emit('update'+type, res);
	});
	socket.on('setDebug',function(debug){
		main.setDebug(debug==true);
	});
});

exports.init = function(conf) {
	config = conf;
	server.listen(config.portRT, function() {
		console.log('Listening on http://localhost:'+config.portRT);
	});
};

/*exports.updateType = function(type,data) {
	io.emit('update'+type, data);
};*/
