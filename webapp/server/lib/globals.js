// actual globals
Q = Meteor.npmRequire('q');

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

  // http://regexr.com/3c0kn
  matches = text.match(/DTB-[A-Z]{1,4}-[0-9]{3}/g);
  if (matches) {
    return matches[0] + pro;
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
