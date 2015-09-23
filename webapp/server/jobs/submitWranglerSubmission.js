// TODO: get rid of all of these case statements

function processSubmission (submissionId) {
  var options = WranglerSubmissions.findOne(submissionId).options;
  console.log("options:", options);

  // before we begin...
  var binarysearch = Meteor.npmRequire('binarysearch');

  // remove all previous submission errors
  WranglerSubmissions.update(submissionId, { $set: { "errors": [] } });
  var errorCount = 0; // increased with addSubmissionError

  // define helpers
  function setSubmissionStatus (newStatus) {
    // TODO: this is being called multiple times with mutations
    console.log("submission:", newStatus);
    WranglerSubmissions.update(submissionId, {$set: {"status": newStatus}});
  }
  function documentCursor (collectionName) {
    return WranglerDocuments.find({
      "submission_id": submissionId,
      "collection_name": collectionName,
    });
  }
  function documentCount (collectionName) {
    return documentCursor(collectionName).count();
  }
  function addSubmissionError (description) {
    if (errorCount < 25) {
      WranglerSubmissions.update(submissionId, {
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
  _.each(WranglerSubmissions.findOne(submissionId).files, function (value) {
    if (value.status !== "done") {
      addSubmissionError("File not done: " + value.file_name);
    }
  });
  if (errorCount > 0) {
    return;
  }

  // make sure there are some documents
  var totalCount = WranglerDocuments
      .find({"submission_id": submissionId})
      .count();
  if (totalCount === 0) {
    addSubmissionError("No documents present");
    return;
  }

  var distinctCollectionNames = _.uniq(_.pluck(WranglerDocuments.find({
        "submission_id": submissionId
      }, {
        sort: { "collection_name": 1 },
        fields: { "collection_name": true },
      })
      .fetch(), "collection_name"), true);

  function collectionNamesWithin (names) {
    // // make sure length matches
    // if (names.length !== distinctCollectionNames.length) {
    //   return false;
    // }

    // checks that contents matches
    return _.every(distinctCollectionNames, function (value) {
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
  }
  else if (collectionNamesWithin(["gene_expression"])) {
    submissionType = "gene_expression";
  }
  if (!submissionType) {
    addSubmissionError("Mixed document types");
    return;
  }

  // modify generically before validation
  WranglerDocuments.update({ "submission_id": submissionId }, {
    $set: {
      "prospective_document.study_label": options.study_label,
      "prospective_document.collaboration_label": options.collaboration_label,
    }
  }, { multi: true });

  // modify before validation
  switch (submissionType) {
    case "mutation":
      WranglerDocuments.update({
        "submission_id": submissionId,
        "collection_name": "mutations",
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
        "submission_id": submissionId,
        "collection_name": {
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
  WranglerDocuments.find({"submission_id": submissionId})
      .forEach(function (object) {
    var context = getContext(object.collection_name);
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
      function ensureLabelExists (label) {
        if (binarysearch(elementLabels, label) !== -1) {
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

      if (foundProblem) {
        return;
      }
      break;
  }

  // can't change it while it's writing to the database
  setSubmissionStatus("writing");

  // modify after validation
  switch (submissionType) {
    case "superpathway":
      var newVersion = 1;
      var oldOne = Superpathways.findOne({"name": options.name},
          { sort: { version: -1 } });
      if (oldOne) {
        newVersion = oldOne.version + 1;
      }
      var superpathwayId = Superpathways.insert({
        "name": options.name,
        "version": newVersion,
      });

      WranglerDocuments.update({
        "submission_id": submissionId,
        "collection_name": {
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

  // TODO: https://docs.mongodb.org/v3.0/tutorial/perform-two-phase-commits/
  WranglerDocuments.find({"submission_id": submissionId})
      .forEach(function (currentDocument) {
    getCollectionByName(currentDocument.collection_name)
        .insert(currentDocument.prospective_document);
    WranglerDocuments.update(currentDocument, {
      $set: {
        "inserted_into_database": true
      }
    });
  });

  setSubmissionStatus("done");
}

jobMethods.submitWranglerSubmission = function (args, jobDone) {
  processSubmission(args.submission_id);
  jobDone();
};
