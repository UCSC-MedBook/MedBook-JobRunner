// actual globals
BlueBird = Meteor.npmRequire('bluebird');






// TODO: delete below this line

jobMethods = {};

rectangularFileStream = function (fileObject) {
  var emitter = new EventEmitter();

  var linePromises = [];

  var lineNumber = 0; // starts at one
  var tabCount;

  var byLine = Meteor.npmRequire('byline');
  byLine(fileObject.createReadStream("blobs"))
    .on('data', Meteor.bindEnvironment(function (lineObject) {
      var deferred = Bluebird.defer();
      linePromises.push(deferred.promise);

      var line = lineObject.toString();
      var brokenTabs = line.split("\t");
      lineNumber++;

      // make sure file is rectangular
      if (tabCount === undefined) {
        tabCount = brokenTabs.length;
      } else if (tabCount !== brokenTabs.length) {
        emitter.emit("error", "File not rectangular. " +
            "Line " + lineNumber + " has " + brokenTabs.length +
            " columns, not " + tabCount);
      }

      emitter.emit("line", brokenTabs, lineNumber, line);

      deferred.resolve();
    }))
    .on('end', Meteor.bindEnvironment(function () {
      Bluebird.all(linePromises)
        .then(Meteor.bindEnvironment(function () {
          emitter.emit("end");
        }));
    }));

  return emitter;
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

// // returns the match if the regex matches the text once, otherwise undefined
// function matchOnce (text, regex) {
//   var matches = text.match(regex);
//   if (matches && matches.length > 0 &&
//       _.every(matches, function (value) {
//         return value === matches[0];
//       })) {
//     return matches[0];
//   }
// }

wrangleSampleLabel = function (text) {
  // try to match something like "DTB-048"
  var matches = text.match(/DTB-[0-9][0-9][0-9]/g);
  if (matches && matches.length > 0) {
    // TODO: what if it's ProR3 or something?
    var progressionMatches = text.match(/pro/gi);
    if (progressionMatches) {
      return matches[0] + "Pro";
    } else {
      return matches[0];
    }
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
