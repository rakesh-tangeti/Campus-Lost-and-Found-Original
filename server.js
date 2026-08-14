const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(require("path").join(__dirname,"public")));

const PORT = process.env.PORT || 3000;
const SECURITY_EMAIL = process.env.SECURITY_EMAIL || "security@campus.edu";
const SECURITY_PASSWORD = process.env.SECURITY_PASSWORD || "admin123";

// Prototype database: shared by every connected browser while this server is running.
// For permanent storage, connect MongoDB/PostgreSQL later.
const reports = [];
const securityTokens = new Set();

function id() {
  return "CLF-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function clean(v) {
  return String(v || "").trim();
}

function scoreMatch(lost, found) {
  let score = 0;
  if (lost.category === found.category) score += 30;

  const ll = lost.location.toLowerCase();
  const fl = found.location.toLowerCase();
  if (ll === fl) score += 25;
  else if (ll.includes(fl) || fl.includes(ll)) score += 15;

  const li = lost.item.toLowerCase();
  const fi = found.item.toLowerCase();
  if (li === fi) score += 30;
  else {
    const words = li.split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => fi.includes(w))) score += 20;
  }

  const ld = lost.description.toLowerCase();
  const fd = found.description.toLowerCase();
  const words = ld.split(/\s+/).filter(w => w.length > 4);
  if (words.some(w => fd.includes(w))) score += 15;

  return Math.min(score, 98);
}

function possibleMatches(report) {
  const otherType = report.type === "lost" ? "found" : "lost";
  return reports
    .filter(r => r.type === otherType && !["returned", "dismissed"].includes(r.status))
    .map(r => {
      const lost = report.type === "lost" ? report : r;
      const found = report.type === "found" ? report : r;
      return { report: r, score: scoreMatch(lost, found), lost, found };
    })
    .filter(x => x.score >= 45)
    .sort((a,b) => b.score - a.score);
}

function broadcastStats() {
  const stats = {
    lost: reports.filter(r => r.type === "lost").length,
    found: reports.filter(r => r.type === "found").length,
    matches: reports.flatMap(r => r.type === "lost" ? possibleMatches(r) : []).length,
    pending: reports.filter(r => ["pending","deposited"].includes(r.status)).length
  };
  io.to("security").emit("stats", stats);
}

app.get("/api/health", (req,res) => res.json({ ok:true, service:"Campus Lost & Found", reports:reports.length }));

app.post("/api/security/login", (req,res) => {
  const email = clean(req.body.email);
  const password = clean(req.body.password);
  if (email !== SECURITY_EMAIL || password !== SECURITY_PASSWORD) {
    return res.status(401).json({ error:"Invalid security credentials" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  securityTokens.add(token);
  res.json({ token });
});

function securityOnly(req,res,next) {
  const token = req.headers.authorization?.replace("Bearer ","");
  if (!token || !securityTokens.has(token)) return res.status(401).json({ error:"Unauthorized" });
  next();
}

app.get("/api/reports", securityOnly, (req,res) => res.json(reports));

app.post("/api/reports", (req,res) => {
  const b = req.body || {};
  if (!["lost","found"].includes(b.type)) return res.status(400).json({error:"Invalid report type"});
  const required = ["item","category","location","date","description","name","contact"];
  if (required.some(k => !clean(b[k]))) return res.status(400).json({error:"Please complete all fields"});

  const report = {
    id:id(),
    type:b.type,
    item:clean(b.item),
    category:clean(b.category),
    location:clean(b.location),
    date:clean(b.date),
    description:clean(b.description),
    name:clean(b.name),
    contact:clean(b.contact),
    status:"pending",
    createdAt:new Date().toISOString()
  };
  reports.unshift(report);

  // Every browser can subscribe to this report's private room.
  io.emit("newReport", report);

  const matches = possibleMatches(report);
  matches.forEach(m => {
    io.to("security").emit("matchAlert", {
      score:m.score,
      lost:m.lost,
      found:m.found
    });
    io.to("report:"+m.lost.id).emit("possibleMatch", {
      score:m.score,
      lost:m.lost,
      found:m.found
    });
  });

  if (report.type === "found") {
    io.to("report:"+report.id).emit("depositRequired", { reportId:report.id });
  }

  broadcastStats();
  res.status(201).json({report, matches:matches.map(m=>({score:m.score,lost:m.lost.id,found:m.found.id}))});
});

app.post("/api/reports/:id/deposit", (req,res) => {
  const report = reports.find(r=>r.id===req.params.id);
  if (!report || report.type !== "found") return res.status(404).json({error:"Found report not found"});
  report.status = "deposited";
  report.depositedAt = new Date().toISOString();
  io.to("security").emit("reportUpdated", report);
  io.to("report:"+report.id).emit("depositConfirmed", report);
  broadcastStats();
  res.json(report);
});

app.post("/api/reports/:id/verify", securityOnly, (req,res) => {
  const { matchedId } = req.body || {};
  const report = reports.find(r=>r.id===req.params.id);
  const matched = reports.find(r=>r.id===matchedId);
  if (!report || !matched) return res.status(404).json({error:"Reports not found"});

  const lost = report.type==="lost" ? report : matched;
  const found = report.type==="found" ? report : matched;
  lost.status = "returned";
  found.status = "returned";
  lost.matchedWith = found.id;
  found.matchedWith = lost.id;

  io.to("security").emit("matchVerified", {lost,found});
  io.to("report:"+lost.id).emit("matchVerified", {lost,found});
  io.to("report:"+found.id).emit("matchVerified", {lost,found});
  broadcastStats();
  res.json({lost,found});
});

app.post("/api/reports/:id/dismiss", securityOnly, (req,res) => {
  const report = reports.find(r=>r.id===req.params.id);
  if (!report) return res.status(404).json({error:"Report not found"});
  report.status = "dismissed";
  io.to("security").emit("reportUpdated", report);
  broadcastStats();
  res.json(report);
});

io.on("connection", socket => {
  socket.on("joinReport", reportId => {
    if (reportId) socket.join("report:"+reportId);
  });
  socket.on("joinSecurity", token => {
    if (securityTokens.has(token)) socket.join("security");
  });
});

app.get("*", (req,res) => res.sendFile(require("path").join(__dirname,"public","index.html")));

server.listen(PORT, ()=>console.log(`Campus Lost & Found running on port ${PORT}`));
