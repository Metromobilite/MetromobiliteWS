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


// dependence du module otpHoraires pour les données temps reel du reseau urbain (reseau primaire)
const Joi = require('koa-joi-router').Joi;
var CronJob = require('cron').CronJob;
var axios = require('axios');
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var fs = require('fs');

var main = require('./index');
var otpHoraires = require('./otpHoraires');

var urlSEM,keySEM;
//var delaiMaxGTFS = 120000;
var delaiMaxGTFS = 180000;

var jobhorairesSEM;

exports.routes = [
	{
		method: 'get',
		path: '/api/gtfs-rt/SEM/trip-update',
		handler: getTripUpdate,
		meta:{
			description:'GTFS-RT trip-udate brut de la TAG.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/gtfs-rt/GAM/trip-update',
		handler: getTripUpdateGAM,
		meta:{
			description:'GTFS-RT trip-udate amelioré de la TAG.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/gtfs-rt/SEM/status',
		handler: getGtfsRtSEMStatus,
		meta:{
			description:'GTFS-RT trip-udate amelioré de la TAG.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/gtfs-rt/SEM/logecart',
		handler: getGtfsRtSEMLogEcarts,
		meta:{
			description:'GTFS-RT log des 100 derniers ecarts de plus de 60s entre le mode requete et le GTFS-RT.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/gtfs-rt/GAM/trips/:tripId',
		handler: getGtfsRtGAMTrip,
		meta:{
			description:'GTFS-RT recuperation d\'une course du GTFS-RT GAM (amelioré).'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	}
];
exports.init = async function (config) {
	try {
		var config = main.getConfig();
		urlSEM = config.plugins.otpHoraires.dependencies.horairesSEM.url;
		keySEM = config.plugins.otpHoraires.dependencies.horairesSEM.key;
		global.etatsServeurs['SEMGTFS']=false;
		global.etatsServeurs['lastTestSEMGTFS']=false;
		global.etatsServeurs['SEMGTFSActif']=false;
		global.liaisonsServeurs['GTFS-RT_SEM'] = { libelle:'Cityway Tag GTFS-RT', lifecycle:otpHoraires.NOT_INITIALIZED };

		main.eventEmitter.on('otpLoaded', async function (evt) {
			otpHoraires.changeEtatLiaisonServeur('GTFS-RT_SEM',true);
			jobhorairesSEM = new CronJob({
				cronTime: '*/20 * * * * *',//toutes les 20 secondes
				onTick: tripUpdateData,
				runOnInit:true,
				start: true,
				timeZone: "Europe/Paris"
			});
		});
		main.eventEmitter.on('horairesSEMrequete', async function (evt) {
			checkTimeGTFSRT(evt.time,evt.line);
		});
	} catch(e){
		main.dumpError(e,'gtfsRtSEM.init');
	}
}
var testGtfsRt = function (body) {
	var FeedMessage = GtfsRealtimeBindings.FeedMessage;
	var feed = FeedMessage.decode(body);
	global.etatsServeurs.lastTestSEMGTFS = new Date().getTime();
	var bEtatLiaison = ( (new Date().getTime() - (feed.header.timestamp*1000)) < delaiMaxGTFS );
	global.etatsServeurs.SEMGTFS = bEtatLiaison;
	//new Date(feed.header.timestamp*1000).toLocaleTimeString();
	//global.etatGtfsRt.routes = {};
	var routes = {};
	if (!bEtatLiaison) {
		console.log('GTFS-RT SEM trop ancien : ' + new Date(feed.header.timestamp*1000).toLocaleString());
	} else {
		//var routes = {};
		for(var i=0;i<feed.entity.length;i++){
			var entity = feed.entity[i];
		//feed.entity.forEach(function(entity) {
			if (entity.trip_update) {
				var codeRoute = global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id];
				if(!routes[codeRoute]) routes[codeRoute]={tripsUpdated:0};
				if( entity.trip_update.stop_time_update.length>0
				&& (!!entity.trip_update.stop_time_update[0].departure || !!entity.trip_update.stop_time_update[0].arrival)
				&& (new Date().getTime() - (entity.trip_update.timestamp.low*1000)) < delaiMaxGTFS ) {
					routes[codeRoute].tripsUpdated++;
				}
			}
		//});
		}
		//global.etatGtfsRt.routes = routes;
	}
	otpHoraires.changeEtatLiaisonServeur('GTFS-RT_SEM',bEtatLiaison);
	changeEtatGTFSRt('routes',routes);
}
// amelioration du GTFS RT
global.gtfsRt = { trips:{}, tripStops:{}, rawFeed:null, feed:null, status:'', statusNbTrips:'', logEcart:[], compteurTotalEcart:0, compteurLogEcart:0 };

var changeEtatGTFSRt = function(field,data){
	global.etatGtfsRt[field] = data;
	main.eventEmitter.emit('changeEtatGtfsRt',global.etatGtfsRt);
}

var cleanGtfsRt = function (feed) {

	//var nbTripDebutOk=0;
	var nbTripNonTrouves={};
	global.gtfsRt.status='';
	global.gtfsRt.seqKo=0;
	var entity_length = 0+feed.entity.length;
	//Suppression des lignes mal équipés pour l'emission de GTFS-RT si delais > 5 minutes
	feed.entity = feed.entity.filter(function(entity){
		//chargement des arrets du trip
		if(!global.gtfsRt.tripStops[entity.trip_update.trip.trip_id]) {
			getTripStops(entity.trip_update.trip.trip_id);
			//bourrin mais pour test on degage les trips inconnus pour etre sur d'avoir des données ok
			return false;
		}
		if (!isSequenceOk(entity)) {
			global.gtfsRt.seqKo++;
			return false;
		}
		if (feed.header.timestamp.low-entity.trip_update.timestamp.low >300) { //Si données supérieures a 5 minutes et qu'on est sur une petite ligne
			//On filtre les cas anormaux (lignes non équipées)
			if(!global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id]) {
				console.error('horairesSEM.cleanGtfsRt : route_id inconnu : SEM:'+entity.trip_update.trip.route_id);
				return false;
			}
			return (main.getConfig().plugins.otpHoraires.dependencies.horairesSEM.filtredLines.indexOf(global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id].split(":")[1]) == -1)
		}
		return true;
	});
	if(main.isDebug()) console.debug(global.gtfsRt.seqKo + ' sequences incorrectes sur '+entity_length);
	for(var i=0;i<feed.entity.length;i++){
		var entity = feed.entity[i];
		//correction: champ is_deleted interdit en FULL_DATASET
		//delete entity.is_deleted; reapparait

		if (entity.trip_update) {
			entity.trip_update = validAndCleanTripUpdate(entity.trip_update);

			// init nbTripNonTrouves
			var r = global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id];
			if(!nbTripNonTrouves[r]) nbTripNonTrouves[r] = {ko:0,total:0};
			nbTripNonTrouves[r].total++;

			saveTripGtfsRt(entity.trip_update);
			//complete le debut du trip avec la sauvegarde memoire
			var tripMemoire = global.gtfsRt.trips[entity.trip_update.trip.trip_id];

			if(tripMemoire && tripMemoire.timestamp.low == entity.trip_update.timestamp.low) {
				entity.trip_update.stop_time_update = tripMemoire.stop_time_update;
			} else {

				nbTripNonTrouves[r].ko++;
			}
			//if(entity.trip_update.stop_time_update[0].stop_sequence==1) nbTripDebutOk++;
			
			//on complete le trip
			//corrections : les directions sont 1et 2 au lieu de 0 et 1
			entity.trip_update.trip.direction_id = entity.trip_update.trip.direction_id-1;
			//ajout du start_date
			if(entity.trip_update.stop_time_update[0].stop_sequence==1) {
				var date = new Date(entity.trip_update.stop_time_update[0].departure.time.low*1000);
				date.setHours(12);
				entity.trip_update.trip.start_date = date.toISOString().substr(0,10).replace(/-/g,'');
			}
		}
	}
	for(var r in nbTripNonTrouves) {
		global.gtfsRt.status += 'Ligne ' + r +' trips non trouvés ' + nbTripNonTrouves[r].ko + ' sur ' + nbTripNonTrouves[r].total + '\n';
	}
	cleanTripGtfsRt();

	if(main.isDebug()) traceAfterCleanGTFS(feed); //Les courses non admissible sont filtrées en dessous

	feed.entity = feed.entity.filter(function(entity){
		var firstTime = entity.trip_update.stop_time_update[0];
		var lastTime = entity.trip_update.stop_time_update[entity.trip_update.stop_time_update.length-1];
		var bTerminus = !lastTime.departure; // C'est un terminus
		//var bTooOld = (feed.header.timestamp.low - entity.trip_update.timestamp.low >300) //Sans nouvelle depuis plus de 5 minutes
		var bSurLePointDePartir = (firstTime.departure && ((firstTime.departure.time.low - 900) < feed.header.timestamp.low)); //Déjà parti ou parti dans moins de 15 minutes
		var bDejaArrivee = (bTerminus && lastTime.arrival && (lastTime.arrival.time.low < feed.header.timestamp.low)); // la course n'est pas encore arrivée
		//Suppression des : "Sans nouvelle depuis plus de 5 minutes" && "Déjà parti ou parti dans moins de 3 minutes" && "Ce n'est pas terminus ou s'en est un mais la course n'est pas encore arrivée"
		if (!bSurLePointDePartir) return false;
		if(bDejaArrivee) return false;
		return true;
	});	
	
	return feed;
}
var validAndCleanTripUpdate = function(trip_update){
	//tronque la fin si les données ne sont pas continues
	var lastSeq = 0;
	var lastDepTime = 0;
	for(var idx = 0 ; idx < trip_update.stop_time_update.length ; idx++){
		var s = trip_update.stop_time_update[idx];
		if( (lastSeq !=0  && lastSeq+1 != s.stop_sequence)
		|| (lastDepTime != 0 && s.departure && lastDepTime > s.departure.time) ) {
			trip_update.stop_time_update.splice(idx);
			break;
		}
		lastSeq=s.stop_sequence;
		if(s.departure) lastDepTime = s.departure.time;
	}
	return trip_update;
}
function isSequenceOk(entity) {
	var tripUpdate = entity.trip_update;
	//si on connait la liste d'arret du trip
	if(global.gtfsRt.tripStops[tripUpdate.trip.trip_id]) {
		if(tripUpdate.stop_time_update.length > 0) {
			var firstStop = tripUpdate.stop_time_update[0];
			if(firstStop.stop_sequence != global.gtfsRt.tripStops[tripUpdate.trip.trip_id].stops[firstStop.stop_id].stop_sequence) {
				//cleanSeqGtfsRt(tripUpdate);
				return false;
			}
			var lastStop = tripUpdate.stop_time_update[tripUpdate.stop_time_update.length-1];
			if(lastStop.stop_sequence != global.gtfsRt.tripStops[tripUpdate.trip.trip_id].stops[lastStop.stop_id].stop_sequence) {
				return false;
			}
		}
	}
	// toujours utile la premiere fois que l'on reçoit un trip
	/*if(tripUpdate.stop_time_update.length > 0
	&& tripUpdate.stop_time_update[0].stop_sequence!=1
	&& !tripUpdate.stop_time_update[0].arrival) {
		for(var idx = 0 ; idx < tripUpdate.stop_time_update.length ; idx++) {
			var t = tripUpdate.stop_time_update[idx];
			t.stop_sequence = idx+1;
		}
	}*/
	
	return true;
}

//sauvegarde des trips en memoire
var saveTripGtfsRt = function(tripUpdate) {

	//si on a un trip qui commence au debut on peut le stocker tel quel deja connu ou pas
	if(tripUpdate.stop_time_update.length > 0 && tripUpdate.stop_time_update[0].stop_sequence==1) {
		global.gtfsRt.trips[tripUpdate.trip.trip_id] = tripUpdate;
	} else { //trip qui ne commence pas au debut
		var tripMemoire = global.gtfsRt.trips[tripUpdate.trip.trip_id];
		//si on connait le trip
		if(tripMemoire) {
				
			var firstSeqAEcraserIdx = 0; //index dans le tripmemoire reçu du premier element du tripupdate reçu
			for(var idx = 0 ; idx < tripMemoire.stop_time_update.length ; idx++) {
				firstSeqAEcraserIdx = idx;
				// a priori on peut avoir un trou avoir un arret manquant en memoire,
				// si on ne recoit jamais de prediction pour un arret
				if(tripMemoire.stop_time_update[idx].stop_sequence == tripUpdate.stop_time_update[0].stop_sequence) {
					break;
				}
			}
			var depOrArrTime = (tripUpdate.stop_time_update[0].departure?tripUpdate.stop_time_update[0].departure.time:tripUpdate.stop_time_update[0].arrival.time);
			//si les horaires sont dans l'ordre entre eux on ajoute les nouveaux en memoire
			if (firstSeqAEcraserIdx > 0
			&& tripMemoire.stop_time_update[firstSeqAEcraserIdx-1].departure.time <= depOrArrTime){
				//on supprime la fin du tableau avant de mettre les nouveaux elements
				tripMemoire.stop_time_update.splice(firstSeqAEcraserIdx);
				tripMemoire.timestamp.low = tripUpdate.timestamp.low;
				var idxMem = firstSeqAEcraserIdx;
				for(var idx2 = 0 ; idx2 < tripUpdate.stop_time_update.length ; idx2++) {
					//index de l'element a ecraser en memoire
					tripMemoire.stop_time_update[idxMem] = tripUpdate.stop_time_update[idx2];
					idxMem++;
				}
			} 

		} else {// trip inconnu on ne le stocke pas

		}
	}
}
async function getTripStops(trip_id){
	try {
		var url = main.getConfig().plugins.otpHoraires.url;
		url += '/routers/default/index/trips/SEM:'+trip_id+'/stops';
		var options = {method:'get', url:url, timeout: 5000, responseType: 'json'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200 || res.statusText!='OK' || !res.data || !Array.isArray(res.data)) {
			console.error('otpIti : Erreur de requete getTripStops, status : ' + res.status + ' Message : ' + res.statusText);
		}
		global.gtfsRt.tripStops[trip_id]={stops:{}};
		res.data.forEach((stop,idx) => {
			stop.stop_sequence = idx+1;
			global.gtfsRt.tripStops[trip_id].stops[stop.id.split(':')[1] ]=stop;
		});
	} catch (e) {
		main.dumpError(e,'horairesSEM.getTripStops');
	}
}
// renumérotation des seq d'un trip
/*
mauvaise idée car signe d'une erreur plus grave
var cleanSeqGtfsRt = function(tripUpdate){
	if(!global.gtfsRt.tripStops[tripUpdate.trip.trip_id].stops[tripUpdate.stop_time_update[0].stop_id]) return;
	
	var seq = global.gtfsRt.tripStops[tripUpdate.trip.trip_id].stops[tripUpdate.stop_time_update[0].stop_id].stop_sequence;
	for(var idx = 0 ; idx < tripUpdate.stop_time_update.length ; idx++) {
		var t = tripUpdate.stop_time_update[idx];
		t.stop_sequence = seq+idx;
	}
}
*/
// nettoyage des trips sauvés en memoire
var cleanTripGtfsRt = function() {
	for (var t in global.gtfsRt.trips){
		var laststoptime;
		if(global.gtfsRt.trips[t].stop_time_update[global.gtfsRt.trips[t].stop_time_update.length-1].arrival) {
			laststoptime = global.gtfsRt.trips[t].stop_time_update[global.gtfsRt.trips[t].stop_time_update.length-1].arrival.time*1000;
		} else if(global.gtfsRt.trips[t].stop_time_update[global.gtfsRt.trips[t].stop_time_update.length-1].departure) {
			laststoptime = global.gtfsRt.trips[t].stop_time_update[global.gtfsRt.trips[t].stop_time_update.length-1].departure.time*1000;
		} else {
			console.log('trip sans horaires : '+t);
			delete global.gtfsRt.trips[t];
			delete global.gtfsRt.tripStops[t];
			continue;
		}
		//si le dernier arret mentionné en memoire est depassé depuis plus de x minutes on efface le trip
		if( (new Date().getTime() - laststoptime) > 10*60*1000 ) {
			//var r = global.otp.idRoutes['SEM:'+global.gtfsRt.trips[t].trip.route_id];
			delete global.gtfsRt.trips[t];
			delete global.gtfsRt.tripStops[t];
			//console.log('ligne '+r+', trip '+t+' supprimé.',new Date(laststoptime).toLocaleTimeString() );
		}
	}
	global.gtfsRt.statusNbTrips='Nombre de trips memorisés : '+ Object.keys(global.gtfsRt.trips).length;
}



async function getGtfsRtSEMLogEcarts(ctx){
	ctx.body = "Ecarts de plus de 60s: " + global.gtfsRt.compteurLogEcart + " sur " + global.gtfsRt.compteurTotalEcart + '\n';
	ctx.body += global.gtfsRt.logEcart.join('\n');
}

async function getGtfsRtSEMStatus(ctx){
	ctx.body = global.gtfsRt.statusNbTrips + '\n' +global.gtfsRt.status;
}

async function getTripUpdateGAM(ctx){
	try {			
		ctx.body = global.gtfsRt.feed;
	} catch(e){
		main.dumpError(e,'horairesSEM.getTripUpdateGAM');
	}
}
async function getTripUpdate(ctx) {
	try {
		var url = main.getConfig().plugins.otpHoraires.dependencies.horairesSEM.tripUpdate;
		
		var options = {method:'get', url:url, timeout: 5000, responseType: 'arraybuffer'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200) {
			console.error('horairesSEM : Erreur de requete tripudate, status : ' + res.status + ' Message : ' + res.statusText);
			ctx.body={};
			return;
		}
		// on teste l'ancienneté des données une fois toutes les 2 minutes
		if( !global.etatsServeurs.lastTestSEMGTFS || ( (global.etatsServeurs.lastTestSEMGTFS+120000) < new Date().getTime() ) ) {
			testGtfsRt(res.data);
		}
		ctx.body=res.data;

	} catch(e){
		main.dumpError(e,'horairesSEM.getTripUpdate');
	}
}
async function getGtfsRtGAMTrip(ctx){
	var tripId = ctx.request.params.tripId;
	ctx.body = (global.gtfsRt.trips[tripId]?global.gtfsRt.trips[tripId]:{});
}
async function tripUpdateData () {
	try {
		var ctx={}
		await getTripUpdate(ctx);
		var res = ctx.body;
		var newFeed = {};
		var FeedMessage = GtfsRealtimeBindings.FeedMessage;
		var feed = FeedMessage.decode(res);
		if(main.isDebug()) traceGTFS(feed,'SEM');
		saveRawFeed(feed);
		newFeed = cleanGtfsRt(feed);
		if(main.isDebug()) traceGTFS(newFeed,'GAM');

		var obj = {
			header :{
				gtfs_realtime_version: "1.0",
				incrementality: 'FULL_DATASET',
				timestamp: Math.floor(new Date().getTime()/1000)
			},
			entity :[]
		};
		if(!!newFeed.entity) {
			obj.entity = newFeed.entity;
		}
		global.gtfsRt.feed = new FeedMessage (obj).toBuffer();
		return false;		
	} catch(err){
		main.dumpError(err,'horairesSEM : tripUpdateData');
	}
}
var traceGTFS = function(feed,suffix){
	var heureFeed = new Date(feed.header.timestamp*1000);
	var name = 'logs/gtfs-'+heureFeed.toISOString().substr(0,16).replace(':','')+'-'+suffix+'.txt';
	var outfile = fs.createWriteStream(name);
	outfile.on('error', function(e) { console.error(e); });
	var content = '';
	content += 'heure feed : '+heureFeed.toLocaleString()+'\n';
	feed.entity.forEach(function(entity) {
		if (entity.trip_update) {
			content += 'trip  : '+entity.trip_update.trip.trip_id+'\n';
			content += 'direction  : '+entity.trip_update.trip.direction_id+'\n';
			content += 'heure : '+new Date(entity.trip_update.timestamp.low*1000).toLocaleTimeString()+'\n';
			content += 'ligne : '+global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id]+'\n';
			entity.trip_update.stop_time_update.forEach(function(stop_time_update) {
				var stopCode = global.otp.idStops['SEM:'+stop_time_update.stop_id];
				if(!stopCode) {
					console.error('horairesSEM.traceGTFS : stopId '+stop_time_update.stop_id+' inconnu !');
					return;					
				}
				if(!global.otp.stops[stopCode]) {
					console.error('horairesSEM.traceGTFS : stopCode '+stopCode+' inconnu !');
					return;
				}
				var line = '';
				line += '  stop_id : '+stop_time_update.stop_id;
				line += '  stop_code : '+stopCode;
				line += ', seq : '+stop_time_update.stop_sequence;
				if(stop_time_update.departure) {
					line += ', dep : '+new Date(stop_time_update.departure.time*1000).toLocaleTimeString();
					if (stop_time_update.departure.delay != null) 
						line += ', delai : '+stop_time_update.departure.delay;
				} else if(stop_time_update.arrival) {
					line += ', arr : '+new Date(stop_time_update.arrival.time*1000).toLocaleTimeString();
					if (stop_time_update.arrival.delay != null) 
						line += ', delai : '+stop_time_update.arrival.delay;
					
				}
				line += ', stop_name : '+global.otp.stops[stopCode].name;
				content += line+'\n';
				
			});
			content += '\n';
		}
	});
	outfile.write(content);
	outfile.close();
}
/*
var traceBeforeCleanGTFS = function(feed){
	var feedEntityBefore = feed.entity.length;
	var lines3Minutes = 0;
	feed.entity = feed.entity.filter(function(entity,idx){
		if (feed.header.timestamp.low-entity.trip_update.timestamp.low >300) { //Si données supérieures a 5 minutes
			//On filtre les cas anormaux (lignes non équipées)
			lines3Minutes++; //Stats GTFS
			return (main.getConfig().plugins.otpHoraires.dependencies.horairesSEM.filtredLines.indexOf(global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id].split(":")[1]) == -1)
		}
		return true;
	});
	var feedEntityAfter = feed.entity.length; //Stats GTFS
	console.log("Nombre de course avant filtre 3min : " + feedEntityBefore + ", Nombre de course après : " + feedEntityAfter + " (" + (feedEntityAfter-feedEntityBefore) + "), total >3min " + lines3Minutes +"");
}
*/

var traceAfterCleanGTFS = function(feed){

	var cpt1 = 0;
	var cpt2 = 0;
	var cpt3 = 0;

	feed.entity.forEach(function(entity){

		var firstTime = entity.trip_update.stop_time_update[0];
		var lastTime = entity.trip_update.stop_time_update[entity.trip_update.stop_time_update.length-1];
		var bTerminus = !lastTime.departure; // C'est un terminus
		var bTooOld = (feed.header.timestamp.low - entity.trip_update.timestamp.low >300) //Sans nouvelle depuis plus de 5 minutes
		var bDejaPartiOuPresque = (firstTime.departure && ((firstTime.departure.time.low - 180) < feed.header.timestamp.low)); //Déjà parti ou parti dans moins de 3 minutes
		var bPasArrivee = bTerminus && lastTime.arrival && (lastTime.arrival.time.low < feed.header.timestamp.low); // la course n'est pas encore arrivée
		

		if (bTooOld && //Sans nouvelle depuis plus de 5 minutes
			bDejaPartiOuPresque && //Déjà parti ou parti dans moins de 3 minutes
			(!bTerminus || (bPasArrivee))) //Ce n'est pas terminus ou s'en est un mais la course n'est pas encore arrivée	
		{
			//en cours
			var ligne =  global.otp.idRoutes['SEM:'+entity.trip_update.trip.route_id];
			var log = 'GTFS-RT ligne : ' + ligne + ", course : " + entity.trip_update.trip.trip_id;
			log +=  ", age > " + Math.trunc((feed.header.timestamp.low-entity.trip_update.timestamp.low)/60)+ ("min");
			//log +=  ", départ dans : " + Math.trunc((entity.trip_update.stop_time_update[0].departure.time.low - feed.header.timestamp.low)/60)+ ("min");
			log += ", séq : " + entity.trip_update.stop_time_update[0].stop_sequence;
			console.log(log);
			cpt1++;
		} else if  ( bTooOld && //Sans nouvelle depuis plus de 5 minutes
					!bPasArrivee) {
			cpt2++; //la course est arrivée (et ce n'est pas un terminus)
		} else if ( bTooOld && //Sans nouvelle depuis plus de 5 minutes
					!bDejaPartiOuPresque) { 
			cpt3++; 
		} // la course n'est presque pas encore partie
	});
	console.log("Nombre de cas non explicable : " + cpt1);
	console.log("Nombre de course déjà arrivée : " + cpt2);
	console.log("Nombre de course pas encore parties : " + cpt3);
	console.log("Nombre de course totales : " + feed.entity.length);
}

checkTimeGTFSRT = async function (time,line){
	var tripRt = global.gtfsRt.rawFeed.trips[''+time.tripId];
	if(!!tripRt) {
		var stopCode = ''+time.stopId;
		var rtStopTime = tripRt.stops[stopCode];
		if(!rtStopTime) {
			return;//arret absent du gtfsRT
		}
		if(time.realtime) {
			global.gtfsRt.compteurTotalEcart++;
			var heureFeed = new Date(global.gtfsRt.rawFeed.header.timestamp*1000).toLocaleTimeString();
			var timeRT,timeReq;
			if(rtStopTime.departure) {
				timeRT = rtStopTime.departure.time.low;
				timeReq = (time.serviceDay+time.realtimeDeparture);
			} else if(rtStopTime.arrival) {
				timeRT = rtStopTime.arrival.time.low;
				timeReq = (time.serviceDay+time.realtimeArrival);
			}
			var ecart = Math.abs(timeRT - timeReq);
			var heureRecueil = new Date(tripRt.timestamp.low*1000).toLocaleTimeString();
			if(ecart>60) {
				var tailleMax = 100;
				var texte = line+', course: '+time.tripId+', heure courante: '+new Date().toLocaleTimeString()+', heure feed: '+heureFeed+', timestamp RT: '+heureRecueil
				texte += ', req: '+new Date(timeReq*1000).toLocaleTimeString()+', RT: '+new Date(timeRT*1000).toLocaleTimeString() + ' (' + ecart + 's) arret: '+time.stopName+'('+stopCode+')';
				
				global.gtfsRt.compteurLogEcart++;
				global.gtfsRt.logEcart.splice(0,0,texte);
				if (global.gtfsRt.logEcart.length>tailleMax) global.gtfsRt.logEcart = global.gtfsRt.logEcart.slice(0,tailleMax);
			}
		}
	}
}
function saveRawFeed(feed) {
	global.gtfsRt.rawFeed={trips:{},header:{timestamp:feed.header.timestamp}};
	for(var i=0;i<feed.entity.length;i++){
		var entity = feed.entity[i];
		if (entity.trip_update) {
			var trip_id = entity.trip_update.trip.trip_id;
			global.gtfsRt.rawFeed.trips[''+trip_id]={stops:{}};
			global.gtfsRt.rawFeed.trips[''+trip_id].timestamp = entity.trip_update.timestamp;
			for(var j=0;j<entity.trip_update.stop_time_update.length;j++){
				var stop_time_update = entity.trip_update.stop_time_update[j];
				var stop_code = global.otp.idStops['SEM:'+stop_time_update.stop_id];
				if(!stop_code) {
					console.error('horairesSEM.saveRawFeed : stopId '+stop_time_update.stop_id+' inconnu !');
					continue;
				}
				global.gtfsRt.rawFeed.trips[''+trip_id].stops[''+stop_code]=stop_time_update;
			}
		}
	}
}