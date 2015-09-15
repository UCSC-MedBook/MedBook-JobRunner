jobMethods.submitWranglerSubmission = function (args, jobDone) {

  var submissionId = args.submission_id;
  var options = WranglerSubmissions.findOne(submissionId).options;

  function setSubmissionStatus(newStatus) {
    // TODO: this is being called multiple times with mutations
    console.log("submission:", newStatus);
    WranglerSubmissions.update(submissionId, {$set: {"status": newStatus}});
  }

  // remove all submission errors
  WranglerSubmissions.update(submissionId, { $set: { "errors": [] } });
  var errorCount = 0;
  function addSubmissionError(description) {
    errorCount++;
    WranglerSubmissions.update(submissionId, {
      $addToSet: {
        "errors": description,
      }
    });
  }

  // make sure each file is "done"
  _.each(WranglerSubmissions.findOne(submissionId).files, function (value) {
    if (value.status !== "done") {
      addSubmissionError("File not done: " + value.file_name);
    }
  });
  if (errorCount > 0) {
    setSubmissionStatus("editing");
    jobDone();
    return;
  }

  // make sure there are some documents
  var documentCount = WranglerDocuments
      .find({"submission_id": submissionId})
      .count();
  if (documentCount === 0) {
    addSubmissionError("No documents present");
    setSubmissionStatus("editing");
    jobDone();
    return;
  }

  // figure out the submission type
  function collectionCount (collectionName) {
    return WranglerDocuments.find({
      "submission_id": submissionId,
      "collection_name": collectionName,
    }).count();
  }

  var submissionType;
  if (documentCount === collectionCount("mutations")) {
    submissionType = "mutation";
  } else if (documentCount === (collectionCount("superpathway_elements") +
      collectionCount("superpathway_interactions"))) {
    submissionType = "superpathway";
  }
  if (!submissionType) {
    addSubmissionError("Mixed document types");
    setSubmissionStatus("editing");
    jobDone();
    return;
  }

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
          "prospective_document.superpathway_id": "soon_to_be_created!",
        }
      }, {multi: true});
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
    setSubmissionStatus("editing");
    jobDone();
    return;
  }

  // validate for specific types
  switch (submissionType) {
    case "superpathway":
      // TODO: make sure superpathway is totally valid
      // - superpathway_elements is unique
      // - superpathway_interactions correspond to elements
      // -
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
  jobDone();
};
