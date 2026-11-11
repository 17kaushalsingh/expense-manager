import fs from 'node:fs';import path from 'node:path';import xcode from 'xcode';
const __dirname=import.meta.dirname;
const file=path.resolve(__dirname,'../ios/App/App.xcodeproj/project.pbxproj');const p=xcode.project(file);p.parseSync();
const first=p.getFirstTarget(),objects=p.hash.project.objects;
let appGroup=Object.entries(objects.PBXGroup).find(([,g])=>typeof g==='object'&&(g.name==='App'||g.path==='App'))?.[0];
if(!appGroup)throw Error('App PBX group missing');
for(const f of ['LedgerWidgetPlugin.swift','LedgerViewController.swift'])if(!p.hasFile(f))p.addSourceFile(f,{target:first.uuid},appGroup);
let target=Object.entries(objects.PBXNativeTarget).find(([,v])=>typeof v==='object'&&v.name?.replaceAll('"','')==='LedgerWidget');
if(!target){const widget=p.addTarget('LedgerWidget','app_extension','LedgerWidget','app.ledgersync.expenses.LedgerWidget');p.addBuildPhase([],'PBXSourcesBuildPhase','Sources',widget.uuid);const group=p.addPbxGroup([],'LedgerWidget','LedgerWidget');p.addToPbxGroup({uuid:group.uuid,basename:'LedgerWidget'},p.getFirstProject().firstProject.mainGroup);p.addSourceFile('LedgerWidget.swift',{target:widget.uuid},group.uuid);target=[widget.uuid,widget.pbxNativeTarget];}
const widgetList=objects.XCConfigurationList[target[1].buildConfigurationList];for(const ref of widgetList.buildConfigurations){Object.assign(objects.XCBuildConfiguration[ref.value].buildSettings,{INFOPLIST_FILE:'LedgerWidget/Info.plist',CODE_SIGN_ENTITLEMENTS:'LedgerWidget/LedgerWidget.entitlements',SWIFT_VERSION:'5.0',SDKROOT:'iphoneos',IPHONEOS_DEPLOYMENT_TARGET:'17.0',TARGETED_DEVICE_FAMILY:'"1,2"',APPLICATION_EXTENSION_API_ONLY:'YES',CURRENT_PROJECT_VERSION:1,MARKETING_VERSION:'1.0',GENERATE_INFOPLIST_FILE:'NO',CODE_SIGN_STYLE:'Automatic'});}
const appList=objects.XCConfigurationList[first.firstTarget.buildConfigurationList];for(const ref of appList.buildConfigurations)objects.XCBuildConfiguration[ref.value].buildSettings.CODE_SIGN_ENTITLEMENTS='App/App.entitlements';
fs.writeFileSync(file,p.writeSync());console.log('Configured WidgetKit extension, embedding, entitlements and plugin sources');
