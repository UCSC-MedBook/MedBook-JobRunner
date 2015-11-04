// actual globals
Q = Meteor.npmRequire('q');
byLine = Meteor.npmRequire('byline');
ntemp = Meteor.npmRequire('temp').track();

path = Npm.require('path');
fs = Npm.require('fs');
spawn = Npm.require('child_process').spawn;

wrangleSampleLabel = function (text) {
  // TODO: what if it's ProR3 or something?
  var pro = "";
  if (text.match(/pro/gi)) {
    pro = "Pro";
  }

  // try to match something like "DTB-000"
  var matches = text.match(/DTB-[0-9][0-9][0-9]/g);
  if (matches) {
    return matches[0] + pro;
  }

  // match weird .vcf file names (e.g. "DTB-OH-014-Pro-AC.anno.fix.vcf")
  // http://regexr.com/3c0kn
  matches = text.match(/DTB-[A-Z]{1,4}-[0-9]{3}/g);
  if (matches) {
    return matches[0] + pro;
  }

  // match TCGA sample labels (e.g. "TCGA-02-0055-01A-01R-1849-01")
  // https://wiki.nci.nih.gov/display/TCGA/TCGA+barcode
  // http://regexr.com/3c1b7
  var tcgaRegex =
  /TCGA-[A-Z0-9]{2}-[A-Z0-9]{1,4}-[0-9]{2}[A-Z]-[0-9]{2}[DGHRTWX]-[A-Z0-9]{4}-[0-9]{2}/g;
  matches = text.match(tcgaRegex);
  if (matches) {
    return matches[0];
  }
};

wrangleSampleUUID = function (text, submission_id) {
  var sample_label;

  WranglerDocuments.find({
    submission_id: submission_id,
    document_type: "sample_label_map",
  }).forEach(function (wranglerDoc) {
    // check if sample_uuid in text
    var index = text.indexOf(wranglerDoc.contents.sample_uuid);
    if (index >= 0) {
      sample_label = wranglerDoc.contents.sample_label;
    }
  });

  return sample_label;
};

// gets the first part of a string, adds "..." at the end if greater than 50
// characters long
firstPartOfLine = function (line) {
  var maxLength = 50;
  var firstPart = line.substring(0, maxLength);
  if (firstPart !== line) {
    firstPart = firstPart.substring(0, maxLength - 3) + "...";
  }
  return firstPart;
};


/**
 * Wrap executing a command in a promise
 * @param  {string}                command command to execute
 * @param  {Array<string>} args    Arguments to the command.
 * @param  {string} cwd            The working directory to run the command in.
 * @return {Promise}               A promise for the completion of the command.
 */
// adapted from https://gist.github.com/Stuk/6226938
// NOTE: currently the stdout and stderr are ignored, but in the comments
// for the original gist there's a way to save them.
spawnCommand = function (command, args, cwd) {
  if (args && !args.every(function (arg) {
        var type = typeof arg;
        return type === "boolean" || type === "string" || type === "number";
      })) {
    return Q.reject(new Error("All arguments must be a boolean, string or number"));
  }

  var deferred = Q.defer();

  var proc = spawn(command, args, { cwd: cwd });

  proc.on("error", function (error) {
    deferred.reject(new Error(command + " " + args.join(" ") + " in " +
        cwd + " encountered error " + error.message));
  });
  proc.on("exit", function(code) {
    if (code !== 0) {
      deferred.reject(new Error(command + " " + args.join(" ") + " in " +
          cwd + " exited with code " + code));
    } else {
      deferred.resolve();
    }
  });

  return deferred.promise;
};
