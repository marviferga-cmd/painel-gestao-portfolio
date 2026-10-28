/* Verifica a sintaxe de todo o JavaScript do projeto (servidor e navegador). */
import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const arquivos = [];
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) varrer(p);
    else if (p.endsWith(".js")) arquivos.push(p);
  }
})(path.join(raiz, "src"));
for (const dir of ["public/js", "prisma", "scripts"]) {
  (function varrer(d) {
    for (const nome of readdirSync(d)) {
      const p = path.join(d, nome);
      if (statSync(p).isDirectory()) varrer(p);
      else if (p.endsWith(".js")) arquivos.push(p);
    }
  })(path.join(raiz, dir));
}
let falhas = 0;
for (const f of arquivos) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { falhas++; console.error(`✘ ${path.relative(raiz, f)}\n${e.stderr}`); }
}
console.log(falhas ? `${falhas} arquivo(s) com erro` : `✔ ${arquivos.length} arquivos sem erro de sintaxe`);
process.exit(falhas ? 1 : 0);
