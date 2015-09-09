function getCollectionByName (collectionName) {
  switch (collectionName) {
    case "superpathway_elements":
      return SuperpathwayElements;
    case "superpathway_interactions":
      return SuperpathwayInteractions;
    case "mutations":
      return Mutations;
    case "gene_expression":
      return GeneExpression;
    case "superpathways":
      return Superpathways;
    default:
      console.log("couldn't find appropriate schema");
      return null;
  }
}

function getSchemaFromName (collectionName) {
  var collection = getCollectionByName(collectionName);
  if (collection)
    return collection.simpleSchema();
  return null;
}

jobMethods.submitWranglerSubmission = function (args, jobDone) {
  var submissionId = args.submission_id;
  console.log("submissionId:", submissionId);

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
  var allDocumentsCursor = WranglerDocuments.find({"submission_id": submissionId});
  if (allDocumentsCursor.count() === 0) {
    addSubmissionError("No documents present");
    setSubmissionStatus("editing");
    jobDone();
    return;
  }

  function collectionCursor (collectionName) {
    return WranglerDocuments.find({
      "submission_id": submissionId,
      "collection_name": collectionName,
    });
  }

  // validate superpathway data types
  if (WranglerDocuments.find({
        "submission_id": submissionId,
        "collection_name": {
          $in: [
            "superpathways",
            "superpathway_elements",
            "superpathway_interactions",
          ]
        }
      }).count() > 0) {
    console.log("validating superpathway stuff");
    if (collectionCursor("superpathways").count() !== 1) {
      addSubmissionError("Exactly one new superpathway must be in the" +
          " submission");
      setSubmissionStatus("editing");
      jobDone();
      return;
    }

    // TODO: ensure uniqueness for element labels
    // don't forget to use collectionCursor :)
    // var elementsWithLabel = WranglerDocuments.find({
    //   "collection_name": "superpathway_elements",
    // }, {
    //   fields: { "label": 1 },
    //   sort: { "label": 1 },
    // }).fetch();
    // _.each(elementsWithLabel, function (element, index) {
    //   if (index !== 0) {
    //     if (element.label === elementsWithLabel[index - 1].label) {
    //       addSubmissionError("Duplicate superpathway element: " +
    //           element.label);
    //     }
    //   }
    // });

    // TODO: ensure uniqueness for interactions

    // TODO: make sure each source/target is defined in elements
  }

  // validate all objects using their relative schemas
  var noSchemaErrors = true;
  allDocumentsCursor.forEach(function (object) {
    if (noSchemaErrors) { // only if there are no errors so far
      var context = getSchemaFromName(object.collection_name)
          .newContext();
      if (context.validate(object.prospective_document)) {
        // console.log("we all good");
      } else {
        console.log("invalid document found!", context.invalidKeys());
        noSchemaErrors = false;
      }
    }
  });

  function setSubmissionStatus(newStatus) {
    // TODO: this is being called multiple times with mutations
    console.log("new submission status:", newStatus);
    WranglerSubmissions.update(submissionId, {$set: {"status": newStatus}});
  }

  if (noSchemaErrors === true) {
    setSubmissionStatus("writing");

    // var updateGeneExpression = true;
    // if (WranglerDocuments.findOne({
    //       "submission_id": submissionId,
    //       "collection_name": "gene_expression",
    //     })) {
    //   // TODO: update GeneExpressionSummary
    // }

    // TODO: https://docs.mongodb.org/v3.0/tutorial/perform-two-phase-commits/
    WranglerDocuments.find({"submission_id": submissionId})
        .forEach(function (object) {
          getCollectionByName(object.collection_name)
              .insert(object.prospective_document);
          // WranglerDocuments.remove(object._id);
        });

    setSubmissionStatus("done");
  } else {
    // TODO: should we email them or something?
    console.log("submission invalid: objects did not pass schema validation");

    setSubmissionStatus("editing");
  }

  jobDone();
};
