// swift-tools-version: 5.9
import PackageDescription

// Official, checksum-verified Capacitor artifacts, prepared by native:sdk.
let package = Package(
    name: "capacitor-swift-pm",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "Capacitor", targets: ["Capacitor"]),
        .library(name: "Cordova", targets: ["Cordova"])
    ],
    targets: [
        .binaryTarget(name: "Capacitor", path: "Frameworks/Capacitor.xcframework"),
        .binaryTarget(name: "Cordova", path: "Frameworks/Cordova.xcframework")
    ]
)
