wranglerSubmissionHandlers.mutation = {
  validate: function (submission_id, helpers) {
    // add missing information to all documents
    var options = WranglerSubmissions.findOne(submission_id).options;
    WranglerDocuments.update({
            submission_id: submission_id,
            collection_name: "mutations",
          }, {
            $set: {
              "contents.study_label": options.study_label,
              "contents.collaboration_label": options.collaboration_label,
              "contents.biological_source": options.biological_source,
              "contents.mutation_impact_assessor":
                  options.mutation_impact_assessor,
            }
          }, { multi: true });

    var context = Mutations.simpleSchema().newContext();
    WranglerDocuments.find({
          submission_id: submission_id,
          // in case we add documents to describe pan-document information
          collection_name: "mutations",
        })
        .forEach(function (doc) {
          if (!context.validate(doc.contents)) {
            helpers.addSubmissionError(_.reduce(context.invalidKeys(),
                function (memo, current) {
                  console.log("current:", current);
                  return memo +
                      "[" + current.name + " is " + current.type + "]";
                },
                "Invalid document: "));
          }
        });

    return true;
  },
  writeToDatabase: function (submission_id, helpers) {
    WranglerDocuments.find({
          submission_id: submission_id,
          collection_name: "mutations",
        }).forEach(function (wranglerDoc) {
          Mutations.insert(wranglerDoc.contents);
        });
    helpers.doneWriting();
  },
};
