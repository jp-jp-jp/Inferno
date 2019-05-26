var fs = require("fs");
var WebSocket = require("ws");
var ws;
var wsconnections = {};
var srcname = JSON.parse('{"socket": {"_peername":{"address":"0.0.0.0"}}}')
//
var http = require('http');
var request = require('request');
//
var newtree = JSON.parse(fs.readFileSync("tree.json"))
var ips = JSON.parse(fs.readFileSync("iplist.json"))
//
var NUM_BYTES_RX_DATA = 6;
var NUM_BYTES_TX_DATA = 4;
var TxData = new Uint8Array(10);
var TxRdIndex = 0;
//
var ember = require("emberplus");
var TreeServer = ember.TreeServer;
var newtree = populatetree(newtree)
const lookup = createlookup(newtree)
var objEmberTree = TreeServer.JSONtoTree(newtree);
var cycles = 1000 // Set this value for how many WS packets are recieved before re-checking all RestAPI variables (Inferno seems to generate about 4Hz WebSocket Send rate)


/////////////
const server = new TreeServer("0.0.0.0", 9000, objEmberTree);
//server._debug = true;
server.listen().then(() => {
	console.log("Ember+ Server Started at TCP 0.0.0.0:9090");
	for (let i = 0; i < newtree[0].children.length; i++) {
		openSocket(newtree[0].children[i].ip, i)
	}
}).catch((e) => { console.log(e.stack); });
server.on("value-change", (element, origin, orginalvalue) => {
	if (orginalvalue != element.contents.value) {
		if (element.contents.identifier === "gain") {
			if (orginalvalue < element.contents.value) {
				//Increse Gain
				for (let i = 0; i < element.contents.value - orginalvalue; i++) {
					setTimeout(function (i) {
						wssend(origin.request.path.split(".")[1], 1, 0, 0, 0)
					}, 100 * i, i)
				}
			}
			else if (orginalvalue > element.contents.value) {
				//Decrease Gain
				for (let i = 0; i < orginalvalue - element.contents.value; i++) {
					setTimeout(function (i) {
						wssend(origin.request.path.split(".")[1], 0, 1, 0, 0)
					}, 100 * i, i)
				}
			}
		}
		else if (element.contents.identifier === "onair") {
			if (element.contents.value != orginalvalue) {
				wssend(origin.request.path.split(".")[1], 0, 0, 0, 1)
			}
		}
		else if (origin.request.path.split(".")[2] == 0) {
			if (element.contents.identifier === "micline") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_misc1_config.cgi?sys=misc1&micline=' + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "mllock") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_misc1_config.cgi?sys=misc1&mllock=' + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "gainlock") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_misc1_config.cgi?sys=misc1&gainlock=' + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "sidetone") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_misc1_config.cgi?sys=misc1&sidetone=' + element.contents.value.replace(/false/g, "0").replace(/true/g, "1")).on('error', function (err) { })
			}
		}
		else if (origin.request.path.split(".")[2] == 1) {
			if (element.contents.identifier === "custdns") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_sys_config.cgi?sys=net&custdnsname=' + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "submask") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_sys_config.cgi?sys=net&submask=' + element.contents.value).on('error', function (err) { })
				//You have to re-send custdns else the box will not re-boot and accept the change...
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_sys_config.cgi?sys=net&custdnsname=' + objEmberTree.getElementByPath(origin.request.path.match(new RegExp(/^(\d+\.\d+)/g)) + lookup["custdns"]).contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "gwaddr") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_sys_config.cgi?sys=net&gwaddr=' + element.contents.value).on('error', function (err) { })
				//You have to re-send custdns else the box will not re-boot and accept the change...
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_sys_config.cgi?sys=net&custdnsname=' + objEmberTree.getElementByPath(origin.request.path.match(new RegExp(/^(\d+\.\d+)/g)) + lookup["custdns"]).contents.value).on('error', function (err) { })
			}
		}
		else if (origin.request.path.split(".")[2] == 2) {
			const chan = (Number(origin.request.path.split(".")[3]) + 1)
			if (element.contents.identifier === "Talk Mode") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_chn_config.cgi?sys=chnconfig' + chan + "&talkmode=" + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "L-B-R") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_chn_config.cgi?sys=chnconfig' + chan + "&lcrmode=" + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "L-B-R locked") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_chn_config.cgi?sys=chnconfig' + chan + "&lcrlocked=" + element.contents.value).on('error', function (err) { })
			}
			else if (element.contents.identifier === "Headphones Fully Off") {
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + '/set_chn_config.cgi?sys=chnconfig' + chan + "&endstop=" + element.contents.value).on('error', function (err) { })
			}
		}
		else if (origin.request.path.split(".")[2] == 3) {
			const chan = (Number(origin.request.path.split(".")[3]) + 1)
			const booltonum =  element.contents.value.replace(/False/g, 0).replace(/True/g, 1)
			if (origin.request.path.split(".")[4] == 0) {
				let array = []
				for (i=0; i < 8; i++){
					array.splice(i, 1, objEmberTree.getElementByPath(origin.request.path.slice(0, -1)+i).contents.value.replace(/False/g, 0).replace(/True/g, 1))
				}	
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + "/set_chneff_config.cgi?sys=eff&sup&" + chan + "=" + parseInt(array.join("").split("").reverse().join(""),2)).on('error', function (err) { })
			}
			else if (origin.request.path.split(".")[4] == 1) {
				let array = []
				for (i=0; i < 8; i++){
					array.splice(i, 1, objEmberTree.getElementByPath(origin.request.path.slice(0, -1)+i).contents.value.replace(/False/g, 0).replace(/True/g, 1))
				}	
				request.get('http://' + lookup[origin.request.path.match(new RegExp(/^(\d+\.\d+)/g))] + "/set_chneff_config.cgi?sys=eff&des&" + chan + "=" + parseInt(array.join("").split("").reverse().join(""),2)).on('error', function (err) { })
			}
		}
	}
});
/////////////
function openSocket(SA, id) {
	ws = new WebSocket("ws://" + SA + "/ppmetc", null, { handshakeTimeout: 1000 });
	ws.binaryType = "arraybuffer";
	ws.id = id
	wsconnections[ws.id] = ws;
	let i = 0
	ws.onopen = function (event) {
		sys(SA)
		net(SA)
		for (let i = 1; i < 9; i++) {
			chan(SA, i)
		}
		chaneffect(SA)
	};

	ws.onmessage = function (event) {
		i++
		if (i != cycles) {
			updatews(event, SA)
		}
		else {
			updatews(event, SA)
			i = 0
			sys(SA)
			net(SA)
			for (let i = 1; i < 9; i++) {
				chan(SA, i)
			}
			chaneffect(SA)
		}
	};
	ws.onclose = function (event) {
	}
	ws.onerror = function (event) {
		console.log("WS Error: " + event.message + " for: " + SA + " with wsID: " + id);
		setTimeout(function () {
			openSocket(SA, id);
		}, 10000);
	};
}
function updatews(event, SA) {
	ProcessRxData(event.data, function (wsdata) {
		updatetreewithpath(SA, lookup["Mic Status"] + lookup["peak"], (300/15)*meter)
		if (objEmberTree.getElementByPath(lookup[SA] + lookup["Mic Status"] + lookup["onair"]).contents.value !== onair) {
			updatetreewithpath(SA, lookup["Mic Status"] + lookup["onair"], onair)
		}
		else if (objEmberTree.getElementByPath(lookup[SA]).contents.rawgain != gain) {
			sys(SA)
			objEmberTree.getElementByPath(lookup[SA]).contents.rawgain = gain
			if (objEmberTree.getElementByPath(lookup[SA] + lookup["Mic Status"] + lookup["micline"]).contents.value == "Line") {
				updatetreewithpath(SA, lookup["Mic Status"] + lookup["gain"], gain - 128)
			}
			else if (objEmberTree.getElementByPath(lookup[SA] + lookup["Mic Status"] + lookup["micline"]).contents.value == "Mic") {
				updatetreewithpath(SA, lookup["Mic Status"] + lookup["gain"], gain - 70)
			}
			else if (objEmberTree.getElementByPath(lookup[SA] + lookup["Mic Status"] + lookup["micline"]).contents.value == "Mic+48V") {
				updatetreewithpath(SA, lookup["Mic Status"] + lookup["gain"], gain - 93)
			}
		}
	});
}
function updatetreewithpath(SA, path, value) {
	let element = objEmberTree.getElementByPath(lookup[SA] + path)
	element.contents.value = value
	let res = server.getResponse(element);
	server.updateSubscribers(element.getPath(), res);
}
function sendToConnectionId(id, data) {
	var ws = wsconnections[id];
	if (ws && ws.readyState == 1) {
		ws.send(data);
	}
}
function wssend(wsID, GainUp, GainDown, GainLineUp, OnAir) {

	TxRdIndex = TxRdIndex + NUM_BYTES_TX_DATA;
	if (TxRdIndex === (10 * NUM_BYTES_TX_DATA))
		TxRdIndex = 0x00;
	//ws.binaryType = 'arraybuffer';
	TxData[0] = GainUp;
	TxData[1] = GainDown;
	TxData[2] = GainLineUp;
	TxData[3] = OnAir;
	sendToConnectionId(wsID, TxData.buffer)
	//Absolutley no idea why you have to send another string if you've changed the OnAir status...
	TxData[0] = 0;
	TxData[1] = 0;
	TxData[2] = 0;
	TxData[3] = 0;
	TxData[4] = 1;
	sendToConnectionId(wsID, TxData.buffer)
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
	// Make a 'On Air = Channel 8 association
	lookup["Channel 8"] = lookup["On Air"]
	//console.log(lookup)
	return lookup
}
function ProcessRxData(RxData, wsdata) {
	var ByteBuffer = new Uint8Array(RxData, 0, NUM_BYTES_RX_DATA);
	this.meter = ByteBuffer[0];
	this.gain = ByteBuffer[5];
	onair = ByteBuffer[4];
	if (onair === 1) {
		this.onair = "true"
	}
	else if (onair === 0) {
		this.onair = "false"
	} wsdata();
}
function sys(SA) {
	http.get("http://" + SA + "/get_misc1_config.cgi?sys=misc1", (resp) => {
		let data = '';
		resp.on('data', (chunk) => { data += chunk; });
		resp.on('end', () => {
			updatetreewithpath(SA, lookup["Mic Status"] + lookup["micline"], parseInt(data.match(new RegExp("micline=(.*)"))[1]));
			updatetreewithpath(SA, lookup["Mic Status"] + lookup["mllock"], data.match(new RegExp("mllock=(.*)"))[1]);
			updatetreewithpath(SA, lookup["Mic Status"] + lookup["gainlock"], data.match(new RegExp("gainlock=(.*)"))[1]);
			updatetreewithpath(SA, lookup["Mic Status"] + lookup["sidetone"], data.match(new RegExp("sidetone=(.*)"))[1].replace(/0/g, "false").replace(/1/g, "true"));;

		})
	})
};
function net(SA) {
	http.get("http://" + SA + "/get_sys_config.cgi?sys=net", (resp) => {
		let data = '';
		resp.on('data', (chunk) => { data += chunk; });
		resp.on('end', () => {

			updatetreewithpath(SA, lookup["Network Status"] + lookup["ipaddr"], data.match(new RegExp("ipaddr=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["custdns"], data.match(new RegExp("custdnsname=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["macaddr"], data.match(new RegExp("macaddr=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["submask"], data.match(new RegExp("submask=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["gwaddr"], data.match(new RegExp("gwaddr=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["serial"], data.match(new RegExp("dnsname=(.*)"))[1])
			updatetreewithpath(SA, lookup["Network Status"] + lookup["dhcp"], data.match(new RegExp("endhcp=(.*)"))[1])
		})
	})
}
function chan(SA, chan) {
	http.get("http://" + SA + "/get_chn_config.cgi?sys=chnconfig" + chan, (resp) => {
		let data = '';
		resp.on('data', (chunk) => { data += chunk; });
		resp.on('end', () => {
			if (chan <= 7) {
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["Channel " + chan] + lookup["Talk Mode"], parseInt(data.match(new RegExp("talkmode=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["Channel " + chan] + lookup["L-B-R"], parseInt(data.match(new RegExp("lcrmode=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["Channel " + chan] + lookup["L-B-R locked"], parseInt(data.match(new RegExp("lcrlocked=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["Channel " + chan] + lookup["Headphones Fully Off"], parseInt(data.match(new RegExp("endstop=(.*)"))[1]));
			}
			else if (chan == 8) {
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["On Air"] + lookup["Talk Mode"], parseInt(data.match(new RegExp("talkmode=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["On Air"] + lookup["L-B-R"], parseInt(data.match(new RegExp("lcrmode=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["On Air"] + lookup["L-B-R locked"], parseInt(data.match(new RegExp("lcrlocked=(.*)"))[1]))
				updatetreewithpath(SA, lookup["Channel Operation"] + lookup["On Air"] + lookup["Headphones Fully Off"], parseInt(data.match(new RegExp("endstop=(.*)"))[1]));
			}
		})
	})
}
function chaneffect(SA) {
	http.get("http://" + SA + "/get_chneff_config.cgi?sys=eff", (resp) => {
		let channeffect = [];
		let data = '';
		resp.on('data', (chunk) => { data += chunk; });
		resp.on('end', () => {
			for (let i = 1; i < 9; i++) {
				for (let j = 1; j < 9; j++)
					updatetreewithpath(SA, lookup["Channel Effect"] + lookup["Channel " + i] + lookup["Surpresses"] + lookup["Channel " + j], ((Number(data.match(new RegExp("sup_" + i + "=(.*)"))[1])).toString(2)).padStart(8, '0').split("").reverse().join("")[j - 1].replace(/0/g, "False").replace(/1/g, "True"))
			}
			for (let i = 1; i < 9; i++) {
				for (let j = 1; j < 9; j++)
					updatetreewithpath(SA, lookup["Channel Effect"] + lookup["Channel " + i] + lookup["Delatches"] + lookup["Channel " + j], ((Number(data.match(new RegExp("des_" + i + "=(.*)"))[1])).toString(2)).padStart(8, '0').split("").reverse().join("")[j - 1].replace(/0/g, "False").replace(/1/g, "True"))
			}
		})
	})
}