var fs = require("fs");
var WebSocket = require("ws");
var Watchdog = require('watchdog')
var http = require('http');
var request = require('request');
var ember = require("emberplus");
var TreeServer = ember.TreeServer;
//
var wsconnections = {};
var newtree = JSON.parse(fs.readFileSync("tree.json"))
var ips = JSON.parse(fs.readFileSync("iplist.json"))
const cycles = 1000	 // Set this value for how many WS packets are recieved before re-checking all RestAPI variables
const serveraddr = "10.10.49.5"
////
var newtree = populatetree(newtree)
const lookup = createlookup(newtree)
const objEmberTree = TreeServer.JSONtoTree(newtree);
const server = new TreeServer(serveraddr, 9000, objEmberTree);
server.listen().then(() => {
	for (let i = 0; i < newtree[0].children.length; i++) {
		openSocket(newtree[0].children[i].ip, i)
	}
}).catch((e) => { console.log(e.stack); });
server.on("value-change", (element, origin, orginalvalue) => {
	if (orginalvalue != element.contents.value) {
		const getpath = `http://${lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))]}`
		if (element.contents.identifier === "gain") {
			if (orginalvalue < element.contents.value) {
				//Increse Gain
				for (let i = 0; i < element.contents.value - orginalvalue; i++) {
					setTimeout(function (i) {
						wssend(origin.request.path.split(".")[1], 1, 0, 0)
					}, 100 * i, i)
				}
			}
			else if (orginalvalue > element.contents.value) {
				//Decrease Gain
				for (let i = 0; i < orginalvalue - element.contents.value; i++) {
					setTimeout(function (i) {
						wssend(origin.request.path.split(".")[1], 0, 1, 0)
					}, 100 * i, i)
				}
			}
		}
		else if (element.contents.identifier === "onair") {
			if (element.contents.value != orginalvalue) {
				wssend(origin.request.path.split(".")[1], 0, 0, 1)
			}
		}
		else if (origin.request.path.split(".")[2] == 0 || origin.request.path.split(".")[2] == 1) {
			sub = origin.request.path.split(".")[2]
			let sys = `${getpath}${httpprocess[sub].set_path}`
			value = element.contents.value
			//Fix Sidetone being Boolean in Ember-tree
			if (element.contents.identifier === "sidetone") {
				value = (element.contents.value | 0).toString()
			}
			arrayloc = httpprocess[sub].children.findIndex(function (item, i) { return item.id === `${element.contents.identifier}` })
			request.get(`${sys}&${httpprocess[sub].children[arrayloc].match}${value}`).on('error', function (err) { })
			// You have to send custdns to force re-boot of unit if setting the below values:
			if (element.contents.identifier === "submask" || element.contents.identifier === "gwaddr") {
				setTimeout(function () {
					request.get(`${sys}&custdnsname=${objEmberTree.getElementByPath(`${origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))}${lookup["Network Status"]}${lookup["custdns"]}`).contents.value}`).on('error', function (err) { })
				}, 1000)
			}
		}
		else if (origin.request.path.split(".")[2] == 2) {
			let chan = (Number(origin.request.path.split(".")[3]) + 1)
			let sys = `${getpath}${channelprocesses[0].set_path}${chan}`
			value = element.contents.value
			arrayloc = channelprocesses[0].children.findIndex(function (item, i) { return item.id === `${element.contents.identifier}` })
			request.get(`${sys}&${channelprocesses[0].children[arrayloc].match}${value}`).on('error', function (err) { })
		}
		else if (origin.request.path.split(".")[2] == 3) {
			const chan = (Number(origin.request.path.split(".")[3]) + 1)
			if (origin.request.path.split(".")[4] == 0) {
				let array = []
				for (i = 0; i < 8; i++) {
					array.splice(i, 1, objEmberTree.getElementByPath(origin.request.path.slice(0, -1) + i).contents.value | 0)
				}
				request.get(`http://${lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))]}/set_chneff_config.cgi?sys=eff&sup&${chan}=${parseInt(array.join("").split("").reverse().join(""), 2)}`).on('error', function (err) { })
			}
			else if (origin.request.path.split(".")[4] == 1) {
				let array = []
				for (i = 0; i < 8; i++) {
					array.splice(i, 1, objEmberTree.getElementByPath(origin.request.path.slice(0, -1) + i).contents.value | 0)
				}
				request.get(`http://${lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))]}/set_chneff_config.cgi?sys=eff&des&${chan}=${parseInt(array.join("").split("").reverse().join(""), 2)}`).on('error', function (err) { })
			}
		}
	}
});
////
function openSocket(SA, id) {
	ws = new WebSocket("ws://" + SA + "/ppmetc", null, { handshakeTimeout: 1000 });
	ws.binaryType = "arraybuffer";
	ws.id = id
	wsconnections[ws.id] = ws;
	let i = 0
	watch = new Watchdog.Watchdog(1000, id)
	ws.onopen = function (event) {
		watch.feed(i)
		parsehttp(SA)
		parsechan(SA)
		parsechaneff(SA)
	};
	ws.onmessage = function (event) {
		i++
		watch.feed(i)
		updatews(event, SA)
		if (i == cycles) {
			i = 0
			parsehttp(SA)
			parsechan(SA)
			parsechaneff(SA)
		}
	};
	ws.onerror = function (event) {
		console.log(`Error on: ${SA} (${ips[id].name})`);
		setTimeout(function () {
			openSocket(SA, id);
		}, 10000);
	};
	watch.on('reset', () => {
		console.log(`Timeout on: ${SA} (${ips[id].name})`);
		setTimeout(function () {
			openSocket(SA, id);
		}, 10000);
	});
}
function updatews(event, SA) {
	ProcessRxData(event.data, function (wsdata) {
		updatetreewithpath(SA, `${lookup["Mic Status"]}${lookup["peak"]}`, (300 / 15) * meter)

		if (objEmberTree.getElementByPath(`${lookup[SA]}${lookup["Mic Status"]}${lookup["onair"]}`).contents.value !== onair) {
			updatetreewithpath(SA, `${lookup["Mic Status"]}${lookup["onair"]}`, onair)
		}
		else if (objEmberTree.getElementByPath(lookup[SA]).contents.rawgain != gain) {
			let element = objEmberTree.getElementByPath(lookup[SA])
			element.contents.rawgain = gain
			let res = server.getResponse(element);
			server.updateSubscribers(element.getPath(), res);
			parsehttp(SA) // Check the Mic Status hasn't changed since last check
			updategain(SA)
		}
	});
}
function ProcessRxData(data, wsdata) {
	var buffer = new Uint8Array(data, 0, 6);
	this.meter = buffer[0];
	this.gain = buffer[5];
	this.onair = !!buffer[4];
	wsdata();
}
function updategain(SA) {
	rawgain = objEmberTree.getElementByPath(lookup[SA]).contents.rawgain
	micstatus = objEmberTree.getElementByPath(`${lookup[SA]}${lookup["Mic Status"]}${lookup["micline"]}`).contents.value
	if (micstatus == 0) {
		gain = rawgain - 128
	}
	else if (micstatus == 1) {
		gain = rawgain - 93
	}
	else if (micstatus == 2) {
		gain = rawgain - 70
	}
	updatetreewithpath(SA, `${lookup["Mic Status"]}${lookup["gain"]}`, gain)
}
function updatetreewithpath(SA, path, value) {
	let element = objEmberTree.getElementByPath(lookup[SA] + path)
	element.contents.value = value
	let res = server.getResponse(element);
	server.updateSubscribers(element.getPath(), res);
}
function wssend(wsID, GainUp, GainDown, OnAir) {
	var ws = wsconnections[wsID];
	if (ws && ws.readyState == 1) {
		ws.send(new Uint8Array([GainUp, GainDown, 0, OnAir, 0, 0, 0, 0, 0, 0]).buffer);
		//Absolutley no idea why you have to send another string if you've changed the OnAir status...	
		ws.send(new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0, 0]).buffer)
	}
}
function parsehttp(SA) {
	for (let i = 0; i < httpprocess.length; i++) {
		http.get(`http://${SA}${httpprocess[i].get_path}`, (resp) => {
			let data = '';
			resp.on('data', (chunk) => { data += chunk; });
			resp.on('end', () => {
				for (let j = 0; j < httpprocess[i].children.length; j++) {
					value = data.match(new RegExp(`${httpprocess[i].children[j].match}(.*)`))[1]
					if (httpprocess[i].children[j].parse != undefined) {
						parse = httpprocess[i].children[j].parse
						value = eval(parse)(value)
					}
					//Fix Sidetone being a num not Boolean
					if (httpprocess[i].children[j].id == "sidetone")
						value = !!value
					updatetreewithpath(SA, lookup[httpprocess[i].lookup] + lookup[httpprocess[i].children[j].id], value)
				}
			})
		})
	}
}
function parsechan(SA) {
	for (let i = 1; i < channelprocesses[0].chan_count + 1; i++) {
		http.get(`http://${SA}${channelprocesses[0].get_path}${i}`, (resp) => {
			let data = '';
			resp.on('data', (chunk) => { data += chunk; });
			resp.on('end', () => {
				for (let j = 0; j < channelprocesses[0].children.length; j++) {
					value = parseInt(data.match(new RegExp(`${channelprocesses[0].children[j].match}(.*)`))[1])
					if (i <= 7) {
						var sys = `${lookup["Channel Operation"]}${lookup[`Channel ${i}`]}`
					}
					else {
						var sys = `${lookup["Channel Operation"]}${lookup["On Air"]}`
					}
					updatetreewithpath(SA, `${sys}${lookup[channelprocesses[0].children[j].id]}`, value)
				}
			})
		})
	}
}
function parsechaneff(SA) {
	http.get(`http://${SA}/get_chneff_config.cgi?sys=eff`, (resp) => {
		let data = '';
		resp.on('data', (chunk) => { data += chunk; });
		resp.on('end', () => {
			for (let i = 1; i < 9; i++) {
				for (let j = 1; j < 9; j++)
					updatetreewithpath(SA, `${lookup["Channel Effect"]}${lookup[`Channel ${i}`]}${lookup["Surpresses"]}${lookup[`Channel ${j}`]}`, !!+((Number(data.match(new RegExp(`sup_${i}=(.*)`))[1])).toString(2)).padStart(8, '0').split("").reverse().join("")[j - 1])
			}
			for (let i = 1; i < 9; i++) {
				for (let j = 1; j < 9; j++)
					updatetreewithpath(SA, `${lookup["Channel Effect"]}${lookup[`Channel ${i}`]}${lookup["Delatches"]}${lookup[`Channel ${j}`]}`, !!+((Number(data.match(new RegExp(`des_${i}=(.*)`))[1])).toString(2)).padStart(8, '0').split("").reverse().join("")[j - 1])
			}
		})
	})
}
function populatetree(tree) {
	let newChildren = [];
	for (let i = 0; i < ips.length; i++) {
		let n = (JSON.parse(JSON.stringify(tree[0].children[0])));
		n.number = i;
		n.identifier = "" + i + ""
		newChildren.push(n);
	}
	newtree[0].children = [];
	newtree[0].children = newChildren;
	let n = (JSON.parse(JSON.stringify(newtree)))
	for (let i = 0; i < ips.length; i++) {
		if (n.identifier == ips.identifier) {
			n[0].children[i].identifier = ips[i].name
			n[0].children[i].ip = ips[i].ip
			n[0].children[i].children[0].children[0].streamIdentifier = i
		}
	}
	return n;
}
function createlookup(tree) {
	let lookup = [];
	for (let i = 0; i < tree[0].children.length; i++) {
		lookup[tree[0].children[i].ip] = "0." + i
		lookup["0." + i] = tree[0].children[i].ip
	}
	for (let i = 0; i < tree[0].children[0].children.length; i++) {
		lookup[tree[0].children[0].children[i].identifier] = "." + i
	}
	for (let i = 0; i < tree[0].children[0].children[0].children.length; i++) {
		lookup[tree[0].children[0].children[0].children[i].identifier] = "." + i
	}
	for (let i = 0; i < tree[0].children[0].children[1].children.length; i++) {
		lookup[tree[0].children[0].children[1].children[i].identifier] = "." + i
	}
	for (let i = 0; i < tree[0].children[0].children[2].children.length; i++) {
		lookup[tree[0].children[0].children[2].children[i].identifier] = "." + i + ""
	}
	for (let i = 0; i < tree[0].children[0].children[2].children[0].children.length; i++) {
		lookup[tree[0].children[0].children[2].children[0].children[i].identifier] = "." + i + ""
	}
	for (let i = 0; i < tree[0].children[0].children[3].children[0].children.length; i++) {
		lookup[tree[0].children[0].children[3].children[0].children[i].identifier] = "." + i + ""
	}
	// Make an 'On Air' = 'Channel 8' association as the unit classes On Air as Channel 8
	lookup["Channel 8"] = lookup["On Air"]
	return lookup
}
const httpprocess = [
	{
		"id": "sys",
		"lookup": "Mic Status",
		"get_path": "/get_misc1_config.cgi?sys=misc1",
		"set_path": "/set_misc1_config.cgi?sys=misc1",
		"children": [
			{ "id": "mllock", "match": "mllock=", "parse": "JSON.parse" },
			{ "id": "gainlock", "match": "gainlock=", "parse": "JSON.parse" },
			{ "id": "sidetone", "match": "sidetone=", "parse": "parseInt" },
			{ "id": "micline", "match": "micline=", "parse": "parseInt" }
		]
	},
	{
		"id": "net",
		"lookup": "Network Status",
		"get_path": "/get_sys_config.cgi?sys=net",
		"set_path": "/set_sys_config.cgi?sys=net",
		"children": [
			{ "id": "ipaddr", "match": "ipaddr=" },
			{ "id": "custdns", "match": "custdnsname=" },
			{ "id": "macaddr", "match": "macaddr=" },
			{ "id": "submask", "match": "submask=" },
			{ "id": "gwaddr", "match": "gwaddr=" },
			{ "id": "serial", "match": "dnsname=" },
			{ "id": "dhcp", "match": "endhcp=", "parse": "JSON.parse" }
		]
	}

]
const channelprocesses = [
	{
		"id": "chnconfig",
		"lookup": "Channel Operation",
		"get_path": "/get_chn_config.cgi?sys=chnconfig",
		"set_path": "/set_chn_config.cgi?sys=chnconfig",
		"chan_count": 8,
		"children": [
			{ "id": "Talk Mode", "match": "talkmode=" },
			{ "id": "L-B-R", "match": "lcrmode=" },
			{ "id": "L-B-R locked", "match": "lcrlocked=" },
			{ "id": "Headphones Fully Off", "match": "endstop=" }
		]
	}
]