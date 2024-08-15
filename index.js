const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const updateNodeURL = () => {
  //vechain-sdk-js/packages/rpc-proxy/config.json
  const configPath = path.join(
    __dirname,
    "vechain-sdk-js/packages/rpc-proxy/config.json",
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  config.url = "https://mainnet.vechain.org";
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};

const runCommand = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const cmd = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    cmd.stdout.on("data", (data) => {
      stdout += data;
      process.stdout.write(data); // Optional: To see output in real-time
    });

    cmd.stderr.on("data", (data) => {
      stderr += data;
      process.stderr.write(data); // Optional: To see errors in real-time
    });

    cmd.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
  });
};

const configureSubgraph = async () => {
    console.log("graph compiler...");
    await runCommand("npx", [
      "graph-compiler",
      "--config",
      "configs/VeBetterDAO.json",
      "--include",
      "node_modules/@openzeppelin/subgraphs/src/datasources",
      "--export-schema",
      "--export-subgraph",
    ]);
    console.log('graph codegen...');
    await runCommand("npx", [
      "graph",
      "codegen",
      "generated/sample.vebetterdao.subgraph.yaml",
    ]);
    console.log("graph build...");
    await runCommand("npx", [
      "graph",
      "build",
      "generated/sample.vebetterdao.subgraph.yaml",
    ]);
    console.log("graph create...");
    await runCommand("npx", [
      "graph",
      "create",
      "sample/vebetterdao",
      "--node",
      "http://127.0.0.1:8020",
    ]);
    console.log("graph deploy...");
    await runCommand("npx", [
      "graph",
      "deploy",
      "sample/vebetterdao",
      "--ipfs",
      "http://localhost:5001",
      "--node",
      "http://localhost:8020",
      "generated/sample.vebetterdao.subgraph.yaml",
      "--version-label",
      "1",
    ]);
}

const start = async () => {
  updateNodeURL();

  try {
    await runCommand("git", ["submodule", "update", "--init", "--recursive"], {
      cwd: __dirname,
    });

    // Execute multiple commands sequentially
    const scriptDir = path.join(__dirname, "vechain-sdk-js");
    await runCommand("cd", [scriptDir], { cwd: __dirname });
    await runCommand("yarn", [], { cwd: scriptDir });
    await runCommand("git", ["checkout", "fix/ethlogs-indexes"], {
      cwd: scriptDir,
    });
    console.log("Building SDK...");
    await runCommand("yarn", ["build"], { cwd: scriptDir });
    console.log("Starting RPC Proxy...");
    runCommand("yarn", [
      "ts-node",
      "vechain-sdk-js/packages/rpc-proxy/src/index.ts",
    ]);
    console.log("Starting docker compose");

    // sleep 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("docker compose up...");
    runCommand("docker-compose", [
      "-f",
      "docker-compose.yaml",
      "up",
      "-d",
      "--wait",
    ]);

    //sleep 30 seconds
    console.log("waiting for the graph to be healthy...");
    await new Promise((resolve) => setTimeout(resolve, 60_000));

    
    await configureSubgraph();

    console.log("waiting....");

    // Not sure if this is needed?
    await configureSubgraph();

    console.log(
      "Done! Don't exit though, I haven't implemented the stop command yet 🤫",
    );
  } catch (error) {
    console.error("Error:", error);
  }
};

start();
