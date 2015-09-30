// TODO: get rid of all of these case statements

var npmBinarySearch = Meteor.npmRequire('binary-search');

function processSubmission (submission_id) {
  var options = WranglerSubmissions.findOne(submission_id).options;
  console.log("options:", options);

  // before we begin...
  var binarysearch = function (array, item) {
    return npmBinarySearch(array, item, function (a, b) { return a > b; });
  };

  // remove all previous submission errors
  WranglerSubmissions.update(submission_id, { $set: { "errors": [] } });
  var errorCount = 0; // increased with addSubmissionError

  // define helpers
  function setSubmissionStatus (newStatus) {
    // TODO: this is being called multiple times with mutations
    console.log("submission:", newStatus);
    WranglerSubmissions.update(submission_id, {$set: {"status": newStatus}});
  }
  function documentCursor (document_type) {
    return WranglerDocuments.find({
      submission_id: submission_id,
      document_type: document_type,
    });
  }
  function documentCount (collectionName) {
    return documentCursor(collectionName).count();
  }
  function addSubmissionError (description) {
    if (errorCount < 25) {
      WranglerSubmissions.update(submission_id, {
        $addToSet: {
          "errors": description,
        }
      });
    }

    if (errorCount === 0) { // no need to set it twice
      setSubmissionStatus("editing");
    }
    errorCount++;
  }

  // make sure each file is "done"
  _.each(WranglerSubmissions.findOne(submission_id).files, function (value) {
    if (value.status !== "done") {
      addSubmissionError("File not done: " + value.file_name);
    }
  });
  if (errorCount > 0) {
    return;
  }

  // make sure there are some documents
  var totalCount = WranglerDocuments
      .find({submission_id: submission_id})
      .count();
  if (totalCount === 0) {
    addSubmissionError("No documents present");
    return;
  }

  var distinctDocumentTypes = _.uniq(_.pluck(WranglerDocuments.find({
        submission_id: submission_id
      }, {
        sort: { "document_type": 1 },
        fields: { "document_type": true },
      })
      .fetch(), "document_type"), true);

  function collectionNamesWithin (names) {
    // // make sure length matches
    // if (names.length !== distinctDocumentTypes.length) {
    //   return false;
    // }

    // checks that contents matches
    return _.every(distinctDocumentTypes, function (value) {
      return _.contains(names, value);
    });
  }

  // figure out the submission type
  var submissionType;
  if (collectionNamesWithin(["mutations"])) {
    submissionType = "mutation";
  } else if (collectionNamesWithin([
        "superpathway_elements",
        "superpathway_interactions"
      ])) {
    submissionType = "superpathway";
  } else if (collectionNamesWithin(["gene_expression"])) {
    submissionType = "gene_expression";
  } else if (collectionNamesWithin(["rectangular_sample_labels"])) {
    submissionType = "rectangular_gene_expression";
  }

  // if we can't figure it out, throw it out
  if (!submissionType) {
    addSubmissionError("Mixed document types");
    return;
  }

  // modify generically before validation
  var needStudyAndCollaboration = [
    "mutations",
    "gene_expression",
  ];
  console.log("distinctDocumentTypes:", distinctDocumentTypes);
  _.each(distinctDocumentTypes, function (document_type) {
    if (needStudyAndCollaboration.indexOf(document_type) > -1) {
      WranglerDocuments.update({
        submission_id: submission_id,
        document_type: document_type,
      }, {
        $set: {
          "prospective_document.study_label": options.study_label,
          "prospective_document.collaboration_label": options.collaboration_label,
        }
      }, { multi: true });
    }
  });

  // modify before validation
  switch (submissionType) {
    case "mutation":
      WranglerDocuments.update({
        submission_id: submission_id,
        "document_type": "mutations",
      }, {
        $set: {
          // TODO: ensure that these options are here
          "prospective_document.biological_source": options.biological_source,
          "prospective_document.mutation_impact_assessor":
              options.mutation_impact_assessor,
        }
      }, {multi: true});
      break;
    case "superpathway":
      WranglerDocuments.update({
        submission_id: submission_id,
        "document_type": {
          $in: [
            "superpathway_elements",
            "superpathway_interactions"
          ]
        },
      }, {
        $set: {
          // so that it is valid according to the schema
          "prospective_document.superpathway_id": "soon_to_be_created!",
        }
      }, {multi: true});
      break;
  }

  // validate all objects using their relative schemas
  var contextCache = {};
  function getContext(collectionName) {
    if (!contextCache[collectionName]) {
      contextCache[collectionName] = getCollectionByName(collectionName)
          .simpleSchema()
          .newContext();
    }
    return contextCache[collectionName];
  }
  errorCount = 0; // defined above
  WranglerDocuments.find({submission_id: submission_id})
      .forEach(function (object) {
    var context = getContext(object.document_type);
    if (context.validate(object.prospective_document)) {
      // console.log("we all good");
    } else {
      errorCount++;
      addSubmissionError("Invalid document present");
      console.log("context.invalidKeys():", context.invalidKeys());
      console.log("object.prospective_document:", object.prospective_document);
    }
  });
  if (errorCount > 0) {
    addSubmissionError("Invalid documents");
    return;
  }

  // validate for specific types
  switch (submissionType) {
    case "superpathway":
      // make sure they have data for elements and interactions
      if (documentCount("superpathway_elements") < 2 ||
          documentCount("superpathway_interactions") < 2) {
        addSubmissionError("Superpathways must have at least two" +
            " elements and two interactions");
        return;
      }

      // make sure each element label is unique
      var foundProblem = false;
      var elementLabels = documentCursor("superpathway_elements")
          .map(function (document) {
            return document.prospective_document.label;
          });
      elementLabels.sort();
      _.each(elementLabels.slice(1), function (label, index) {
        // index in here are one off from elementLabels (did a slice)
        if (label === elementLabels[index]) {
          addSubmissionError("Duplicate element names: " + label);
          foundProblem = true;
        }
      });

      // make sure labels in interactions are defined in elements
      console.log("elementLabels:", elementLabels);
      function ensureLabelExists (label) {
        console.log("label:", label);
        console.log("binarysearch(elementLabels, label):", binarysearch(elementLabels, label));
        if (binarysearch(elementLabels, label) < 0) {
          addSubmissionError(label + " used in interactions without a" +
              " corresponding entry in elements");
          foundProblem = true;
        }
      }
      documentCursor("superpathway_interactions")
          .forEach(function (document) {
        ensureLabelExists(document.prospective_document.source);
        ensureLabelExists(document.prospective_document.target);
      });

      // make sure labels defined in elements are used in interactions
      _.each(elementLabels, function (label) {
        var interaction = WranglerDocuments.findOne({
          submission_id: submission_id,
          document_type: "superpathway_interactions",
          $or: [
            {"prospective_document.source": label},
            {"prospective_document.target": label},
          ],
        });
        if (!interaction) {
          addSubmissionError(
              label + " defined but not used in any interactions");
          foundProblem = true;
        }
      });
      break;
    case "gene_expression":
      // insert into expression2
      WranglerDocuments.find({submission_id: submission_id})
          .forEach(function (object) {
        var prospective = object.prospective_document;
        // find the corresponding expression2 entry
        var expression2Document = expression2.findOne({
          gene: prospective.gene_label,
          Study_ID: prospective.study_label,
        }, {fields: {samples: 0}});
        console.log("expression2Document:", expression2Document);
        if (expression2Document) {
          var setObject = {};
          setObject["samples." +
              prospective.sample_label + "." +
              prospective.normalization] = prospective.value;

          expression2.update(expression2Document._id, { $set: setObject });
        } else {
          console.log("couldn't find expression2 object for " + prospective.gene_label);
        }
      });
  }

  if (foundProblem) {
    return;
  }

  // can't change it while it's writing to the database
  setSubmissionStatus("writing");

  // modify after validation
  switch (submissionType) {
    case "superpathway":
      var version = 1;
      var oldOne = Superpathways.findOne({"name": options.name},
          { sort: { version: -1 } });
      if (oldOne) {
        version = oldOne.version + 1;
      }
      var superpathwayId = Superpathways.insert({
        name: options.name,
        version: version,
        study_label: options.study_label,
        collaboration_label: options.collaboration_label,
      });

      WranglerDocuments.update({
        submission_id: submission_id,
        "document_type": {
          $in: [
            "superpathway_elements",
            "superpathway_interactions"
          ]
        },
      }, {
        $set: {
          "prospective_document.superpathway_id": superpathwayId,
        }
      }, {multi: true});
      break;
  }

  // if (submissionType === )

  // TODO: https://docs.mongodb.org/v3.0/tutorial/perform-two-phase-commits/
  WranglerDocuments.find({submission_id: submission_id})
      .forEach(function (currentDocument) {
    getCollectionByName(currentDocument.document_type)
        .insert(currentDocument.prospective_document);
    WranglerDocuments.update(currentDocument, {
      $set: {
        "inserted_into_database": true
      }
    });
  });

  setSubmissionStatus("done");
}

jobMethods.submitWranglerSubmission = {
  argumentSchema: new SimpleSchema({
    "submission_id": { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    processSubmission(args.submission_id);
    jobDone();
  },
  onError: function (args, errorDescription) {
    WranglerSubmissions.update(args.submission_id, {
      $set: {
        "status": "error",
        "errors": ["error running job: " + errorDescription],
      }
    });
  },
};
