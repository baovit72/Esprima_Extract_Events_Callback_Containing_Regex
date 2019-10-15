var esprima = require("esprima");
var fs = require("fs");
const lineReader = require('line-reader');
var os = require("os");
//Global variable
// Array of regex collected
var regexs = [];
//Array of callback function in event register
var callback_functions = [];
// Lines of file
var file_lines = [];
//File name
var file_name = "";
//Function nodes
var function_nodes = [];
//Function names
var function_names = [];
//Traverse through each node
function traverse(node, func) {
	func(node);//1
	for (var key in node) { //2
		if (node.hasOwnProperty(key)) { //3
			var child = node[key];
			if (typeof child === 'object' && child !== null) { //4

				if (Array.isArray(child)) {
					child.forEach(function (node) { //5
						traverse(node, func);
					});
				} else {
					traverse(child, func); //6
				}
			}
		}
	}
}
//Get all nodes by type name
function get_all_nodes_by_type(ast, typename) {
	var nodes = [];
	traverse(ast, function (node) {
		if (node.type == typename) {
			nodes.push(node);
		}
	});
	return nodes;
}
/**
 * Get all function nodes and names
	Return array of names and array of nodes
*/
function get_functions(ast) {
	var names = [];
	var nodes = [];
	traverse(ast, (node) => {
		if (node.type === "FunctionDeclaration" && node.id !== null) {
			names.push(node.id.name);
			nodes.push(node);
		}
		if (node.type === "VariableDeclaration" && node.declarations[0].init !== null && node.declarations[0].init != undefined &&
			(node.declarations[0].init.type === "FunctionExpression" || node.declarations[0].init.type === "ArrowFunctionExpression")) {
			{
				names.push(node.declarations[0].id.name);
				nodes.push(node.declarations[0].init);
			}
		}
	})
	return [names, nodes];
}
//Get regex in function nodes


function extract_regex_in_node(node) {
	//Recurse 
	var callee_nodes = get_all_nodes_by_type(node, "CallExpression");
	callee_nodes.forEach(node => {
		if (node.callee.type === "Identifier")
			for (var i = 0; i < function_nodes.length; i++) {
				if (function_names[i] === node.callee.name) {
					extract_regex_in_node(function_nodes[i]);
				}
			}
	});
	//Get regex from current node
	console.log("Event callback function: ");
	// console.log("Function name: " + node.id.name);
	var begin_function = -1;
	var end_function = -1;
	begin_function = node.loc.start.line;
	end_function = node.loc.end.line;
	console.log("Function location: from line ", begin_function, " to line ", end_function);
	var full_function_code = "";
	for (var k = begin_function; k <= end_function; k++) {
		//Check if contains regex
		//Replace function 
		//Array of concerned strings
		var regex_users = [".replace(", ".search(", ".match("];
		var regex_users_type_1 = [".replace("];
		var which_user = -1;
		for (var r = 0; r < regex_users.length; r++) {
			if (file_lines[k].includes(regex_users[r])) {
				which_user = r;
				break;
			}
		}
		if (which_user == -1)
			continue;
		var regex_coded_line = file_lines[k];
		var which_user_string = regex_users[which_user];
		var begin = regex_coded_line.indexOf(which_user_string) + which_user_string.length;
		if (begin != -1) {
			var end = -1;
			if (!regex_users_type_1.includes(which_user_string)) {
				end = regex_coded_line.indexOf(")", begin);
			}
			else {
				end = regex_coded_line.indexOf(",", begin);
			}
			if (end != -1) {
				var regex_string_from_line = regex_coded_line.substring(begin, end).trim();
				if (regex_string_from_line[0] == "/" && regex_string_from_line.indexOf("/", 2) != -1)
					regexs.push(regex_string_from_line);
			}
		}
	}
}

async function main() {
	//Get file name
	var file_names = process.argv.slice(2);
	file_name = file_names[0];
	//Read file
	await fs.readFile(file_name, "utf8", function (err, data) {
		//console.log("Error :" + err);
		//console.log("Data :" + data);
		file_lines = data.match(/^.*((\r\n|\n|\r)|$)/gm);
		//Get callback function in event register ** handle complex expression (vi tri tham so, arrow function, arrow function as argument)
		//Can not split line //Handled
		/* file_lines.forEach(function (line) {
			if (line.trim().includes(".addListener") || line.trim().includes(".on(")) {
				fs.appendFile("EsprimaOutput.txt", file_name + "\r\n" + line, (err) => { console.log(err) });
				try {
					callback_functions.push(line.replace(");", "").split(",")[2].trim());
				} catch{ callback_functions.push(line.replace(");", "").split(",")[1].trim()); }
			}
		}); */
		//Traverse through ast
		var ast = esprima.parseScript(data, { loc: true });

		//Get all function nodes , names
		[function_names, function_nodes] = get_functions(ast);

		console.log(function_names);

		/* 	for (var iterator = 0; iterator < function_nodes.length; iterator++) {
				if (callback_functions.includes(function_nodes[iterator].id.name)) {
					extract_regex_in_node(function_nodes[iterator]);
				}
			} */
		//Seek call back in on (anonymous) 
		traverse(ast, (node) => {
			if (node.type === "CallExpression" && node.callee != undefined
				&& node.callee.type === "MemberExpression" && (node.callee.property.name === "on" || node.callee.property.name === "addListener") && node.arguments.length == 2
				&& (node.arguments[1].type === "FunctionExpression" || node.arguments[1].type === "ArrowFunctionExpression")) {
				fs.appendFile("EsprimaOutput_Statistics.txt", "\r\n" + file_name + "\r\n" + file_lines[node.loc.start.line - 1], (err) => { console.log(err) });
				extract_regex_in_node(node);
			}
		})
		if (regexs.length > 0) {
			console.log("Regex detected: ");
			fs.appendFile("EsprimaOutput_Regex.txt", "\r\n" + file_name + "\r\n" + regexs.toString(), (err) => { console.log(err) });
			console.log(regexs);
			//fs.appendFile("EsprimaOutput.txt", file_name + "\r\n" + regexs.toString(), (err) => { console.log(err) });
		}
		//fs.appendFile("EsprimaOutput_Regex.txt", file_name + "\r\n" + regexs.toString(), (err) => { console.log(err) });

	})

}
main();