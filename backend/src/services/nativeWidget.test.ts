import {describe,it,expect} from "vitest";
import {spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const java=spawnSync("javac",["-version"],{encoding:"utf8"});
describe.skipIf(java.status!==0)("actual JVM widget boundary",()=>{it("redacts hidden amounts and rejects expired or excessive snapshots",()=>{const dir=mkdtempSync(join(tmpdir(),"ledger-widget-jvm-"));try{writeFileSync(join(dir,"WidgetHarness.java"),`import app.ledgersync.expenses.WidgetSnapshot;
public class WidgetHarness {public static void main(String[] args){long now=1794402000000L;String future=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"){{setTimeZone(java.util.TimeZone.getTimeZone("UTC"));}}.format(new java.util.Date(now+300000));
if(!WidgetSnapshot.parse(1,future,false,"secret amount",now).net.equals("••••"))throw new AssertionError("Hidden amount leaked");
if(!WidgetSnapshot.parse(1,future,true,"$123",now).net.equals("$123"))throw new AssertionError("Opt-in failed");
int rejected=0;try{WidgetSnapshot.parse(1,future,true,"$123",now+400000);}catch(IllegalArgumentException e){rejected++;}try{WidgetSnapshot.parse(1,future,true,"x".repeat(81),now);}catch(IllegalArgumentException e){rejected++;}try{WidgetSnapshot.parse(2,future,true,"$123",now);}catch(IllegalArgumentException e){rejected++;}if(rejected!=3)throw new AssertionError("Boundary not enforced");System.out.print("verified");}}
`);const compile=spawnSync("javac",["-d",dir,fileURLToPath(new URL("../../../frontend/android/app/src/main/java/app/ledgersync/expenses/WidgetSnapshot.java",import.meta.url)),join(dir,"WidgetHarness.java")],{encoding:"utf8"});expect(compile.status,compile.stderr).toBe(0);const run=spawnSync("java",["-cp",dir,"WidgetHarness"],{encoding:"utf8"});expect(run.status,run.stderr).toBe(0);expect(run.stdout).toBe("verified");}finally{rmSync(dir,{recursive:true,force:true});}},15000);});
