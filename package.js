Package.describe({
  summary: "Verifier",
  version:'0.3.1',
  name: "sebakerckhof:verify",
  git: "https://github.com/sebakerckhof/meteor-verify.git"
});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');

  var packages = [
    'meteor',
    'underscore'
  ];

  api.use([].concat(packages));

  // WEAK DEPENDENCIES
  api.use([], {weak:true});
  // UNORDERED DEPENDENCIES (to solve
  api.use([], {unordered:true});

  // SHARED FILES
  api.addFiles(
    [
      'verify.js',
    ],
    ['client','server']);

  // CLIENT FILES
  api.addFiles(
    [],
    'client');

  // SERVER FILES
  api.addFiles(['checkForLoops.js'], 'server');

  //NPM Dependencies
  Npm.depends({});

  //EXPORT VARIABLES
  api.export(['verify','Verifier']);

});

Package.onTest(function (api) {

});
