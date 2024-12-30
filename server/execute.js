const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const { exec, spawn } = require("child_process");
const path = require("path");
const os = require("os");

const getCode = ({ codeBlocks }) => {
	const codeObject = {};
	for (const item of codeBlocks) {
		let language = item.language;
		// Trattare JSX come JavaScript
		if (
			language === "js" ||
			language === "javascript" ||
			language === "jsx"
		) {
			language = "js";
		}

		const _language = `${language}Code`;
		if (!codeObject[_language]) {
			codeObject[_language] = "";
		}
		codeObject[_language] = item.code;
	}
	return codeObject;
};

const createFiles = async ({
	jsCode,
	htmlCode,
	serverJsPath,
	directoryPath,
}) => {
	try {
		if (!jsCode) {
			throw new Error("JavaScript code is undefined or null.");
		}

		// Sostituzione di "import" con "require", con gestione avanzata
		const transformedJsCode = jsCode.replace(
			/import\s+([\s\S]+?)\s+from\s+['"](.+?)['"]/g,
			(match, imports, module) => {
				// Gestisce importazioni multiple come: import React, { useState } from 'react'
				const defaultImportMatch = imports.match(/^(\w+),?\s*/);
				const namedImportsMatch = imports.match(/{([\s\S]+)}/);

				let result = "";
				if (defaultImportMatch) {
					result += `const ${defaultImportMatch[1]} = require('${module}');\n`;
				}
				if (namedImportsMatch) {
					const namedImports = namedImportsMatch[1]
						.split(",")
						.map(
							(imp) =>
								`const ${imp.trim()} = require('${module}').${imp.trim()};`
						)
						.join("\n");
					result += namedImports;
				}
				return result.trim();
			}
		);

		await fs.mkdir(directoryPath, { recursive: true });
		await fs.writeFile(serverJsPath, transformedJsCode);

		if (htmlCode) {
			const publicDirectoryPath = path.join(directoryPath, "public");
			const indexHtmlPath = path.join(publicDirectoryPath, "index.html");
			await fs.mkdir(publicDirectoryPath, { recursive: true });
			await fs.writeFile(indexHtmlPath, htmlCode);
		}
	} catch (err) {
		console.error("Error creating files:", err);
		throw err;
	}
};

const initNpm = async ({ bashCode, directoryPath }) => {
	const commands = [
		`cd "${directoryPath}"`,
		"npm init -y",
		"npm pkg set type=module",
		bashCode,
	];
	return new Promise((resolve, reject) => {
		exec(commands.join(" && "), { shell: true }, (err, stdout, stderr) => {
			if (err) {
				console.error("Error initializing npm:", err);
				reject(err);
				return;
			}
			if (stderr) console.error("NPM stderr:", stderr);
			resolve();
		});
	});
};

const spawnNode = ({ sendMessage, serverJsPath }) => {
	return new Promise((resolve, reject) => {
		const serverProcess = spawn("node", [serverJsPath], { shell: true });
		let stdoutData = "";

		serverProcess.stdout.on("data", (data) => {
			stdoutData += data.toString();
			sendMessage(data.toString().replace(/\r?\n|\r/g, " "));
		});

		serverProcess.stderr.on("data", (data) => {
			sendMessage(data.toString());
		});

		serverProcess.on("error", (error) => {
			console.error("Error in server process:", error);
			reject(error);
		});

		serverProcess.on("exit", (code, signal) => {
			sendMessage(
				`Server process exited with code ${code} and signal ${signal}`
			);
			resolve(stdoutData);
		});
	});
};

module.exports = async ({ codeBlocks, sendMessage }) => {
	const projectId = uuidv4();
	const { jsCode, bashCode, htmlCode } = getCode({ codeBlocks });

	if (!jsCode) {
		sendMessage("JavaScript code block is required but not provided.");
		throw new Error("JavaScript code block is missing.");
	}

	const directoryPath = path.join(
		os.tmpdir(),
		"chatgpt-artifacts",
		projectId
	);
	const serverJsPath = path.join(directoryPath, "server.js");

	sendMessage(`Creating project directory on ${directoryPath}`);
	await createFiles({ jsCode, htmlCode, serverJsPath, directoryPath });

	if (bashCode) {
		sendMessage(`Installing: ${bashCode}`);
		await initNpm({ bashCode, directoryPath });
	}

	sendMessage("Running:");
	sendMessage("----------");
	await spawnNode({ sendMessage, serverJsPath });
};
