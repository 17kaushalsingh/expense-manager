import fs from "node:fs";
import path from "node:path";
import xcode from "xcode";
const __dirname = import.meta.dirname;
const file = path.resolve(
  __dirname,
  "../ios/App/App.xcodeproj/project.pbxproj",
);
const p = xcode.project(file);
p.parseSync();
const first = p.getFirstTarget(),
  objects = p.hash.project.objects;
let appGroup = Object.entries(objects.PBXGroup).find(
  ([, g]) => typeof g === "object" && (g.name === "App" || g.path === "App"),
)?.[0];
if (!appGroup) throw Error("App PBX group missing");
for (const f of ["LedgerWidgetPlugin.swift", "LedgerViewController.swift", "LedgerFilesPlugin.swift"])
  if (!p.hasFile(f)) p.addSourceFile(f, { target: first.uuid }, appGroup);
let target = Object.entries(objects.PBXNativeTarget).find(
  ([, v]) =>
    typeof v === "object" && v.name?.replaceAll('"', "") === "LedgerWidget",
);
if (!target) {
  const widget = p.addTarget(
    "LedgerWidget",
    "app_extension",
    "LedgerWidget",
    "app.ledgersync.expenses.LedgerWidget",
  );
  p.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", widget.uuid);
  const group = p.addPbxGroup([], "LedgerWidget", "LedgerWidget");
  p.addToPbxGroup(
    { fileRef: group.uuid, basename: "LedgerWidget" },
    p.getFirstProject().firstProject.mainGroup,
  );
  p.addSourceFile("LedgerWidget.swift", { target: widget.uuid }, group.uuid);
  target = [widget.uuid, widget.pbxNativeTarget];
}
const widgetList =
  objects.XCConfigurationList[target[1].buildConfigurationList];
for (const ref of widgetList.buildConfigurations) {
  Object.assign(objects.XCBuildConfiguration[ref.value].buildSettings, {
    INFOPLIST_FILE: "LedgerWidget/Info.plist",
    CODE_SIGN_ENTITLEMENTS: "LedgerWidget/LedgerWidget.entitlements",
    SWIFT_VERSION: "5.0",
    SDKROOT: "iphoneos",
    IPHONEOS_DEPLOYMENT_TARGET: "17.0",
    TARGETED_DEVICE_FAMILY: '"1,2"',
    APPLICATION_EXTENSION_API_ONLY: "YES",
    CURRENT_PROJECT_VERSION: 1,
    MARKETING_VERSION: "1.0",
    GENERATE_INFOPLIST_FILE: "NO",
    CODE_SIGN_STYLE: "Automatic",
  });
}
const appList =
  objects.XCConfigurationList[first.firstTarget.buildConfigurationList];
for (const ref of appList.buildConfigurations)
  objects.XCBuildConfiguration[ref.value].buildSettings.CODE_SIGN_ENTITLEMENTS =
    "App/App.entitlements";
const mainGroup = objects.PBXGroup[p.getFirstProject().firstProject.mainGroup];
const widgetGroup = Object.entries(objects.PBXGroup).find(
  ([, g]) =>
    typeof g === "object" && g.name?.replaceAll('"', "") === "LedgerWidget",
)?.[0];
mainGroup.children = mainGroup.children.filter(
  (child) => typeof child.value === "string",
);
if (
  widgetGroup &&
  !mainGroup.children.some((child) => child.value === widgetGroup)
)
  mainGroup.children.push({ value: widgetGroup, comment: "LedgerWidget" });
function clean(value) {
  if (value && typeof value === "object")
    for (const key of Object.keys(value)) {
      if (value[key] === undefined || value[key] === "undefined")
        delete value[key];
      else clean(value[key]);
    }
}
clean(objects);
fs.writeFileSync(file, p.writeSync());
console.log(
  "Configured WidgetKit extension, embedding, entitlements and plugin sources",
);

const spm = path.resolve(__dirname, "../ios/App/CapApp-SPM/Package.swift");
fs.writeFileSync(
  spm,
  fs.readFileSync(spm, "utf8").replace(/\.package\(url: "https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git", (?:from|exact): "[^"]+"\)/, '.package(name: "capacitor-swift-pm", path: "../CapacitorSDK")'),
);
