const next = require("next");
const socketIo = require("socket.io");
const { createServer } = require("http");

const execute = require("./execute");
const findAvailablePort = require("./findAvailablePort");

// Imposta manualmente NODE_ENV per compatibilità su Windows
if (process.platform === "win32") {
	process.env.NODE_ENV = process.env.NODE_ENV || "development";
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const showCurrentTime = () => {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	const seconds = String(now.getSeconds()).padStart(2, "0");
	return `${hours}:${minutes}:${seconds}`;
};

app.prepare().then(() => {
	const server = createServer((req, res) => {
		if (req.url === "/") {
			return app.render(req, res, "/", req.query);
		}

		return handle(req, res);
	});

	const io = socketIo(server);

	io.on("connection", (socket) => {
		socket.on("codeBlocks", (codeBlocks) => {
			console.log("Ricevuti codeBlocks:", codeBlocks); // Aggiunto per debug
			const sendMessage = (message) => {
				const _message = `${showCurrentTime()}: ${message}`;
				console.log(_message);
				io.emit("codeBlocks", _message);
			};

			execute({ codeBlocks, sendMessage }).catch((err) => {
				console.error("Errore nell'esecuzione:", err);
			});
		});
	});

	findAvailablePort(3000).then((port) => {
		server.listen(port, (err) => {
			if (err) throw err;
			console.log(`> Ready on http://localhost:${port}`);
		});
	});
});
