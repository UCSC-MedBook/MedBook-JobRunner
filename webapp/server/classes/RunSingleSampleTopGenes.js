function RunSingleSampleTopGenes (job_id) {
  Job.call(this, job_id);
}
RunSingleSampleTopGenes.prototype = Object.create(Job.prototype);
RunSingleSampleTopGenes.prototype.constructor = RunSingleSampleTopGenes;

RunSingleSampleTopGenes.prototype.run = function () {
  var deferred = Q.defer();
  var self = this;

  // Create the gene set first that we know the geneSetId for the records.

  var dataSet = DataSets.findOne(this.job.args.data_set_id);

  // store this in a variable so we can use it to validate records
  var geneSetFields = [
    { name: "Genes", value_type: "String" },
    { name: "Expression value", value_type: "Number" },
  ];

  // figure out name and description
  var args = this.job.args;
  var uq_sample_label = MedBook.utility
      .sampleStrToObj(args.sample_label)
      .uq_sample_label;

  var topString;
  if (args.percent_or_count === "percent") {
    topString = args.top_percent + "% of genes";
  } else {
    topString = args.top_count + " genes";
  }

  GeneSets.rawCollection().insert({
    // XXX: change mongo's _id creation function to use simple strings
    _id: Random.id(),

    name: "Top " + topString + " in " + uq_sample_label,
    description: "Top " + topString + " in " + args.sample_label +
        " from " + args.data_set_name,

    // set collaborations to [] so no one can see it before it's ready
    collaborations: [],

    fields: geneSetFields,

    // blank for now
    gene_labels: [],
    gene_label_field: "Genes",
  }, Meteor.bindEnvironment(function (error, result) {
    if (error) {
      deferred.reject(error);
      return;
    }

    var geneSetId = result[0]._id;

    // prepare to grab the data from the db
    var valueIndex = dataSet.sample_label_index[args.sample_label];

    // grab all of the data for the sample without sorting
    // NOTE: sorting at this point uses too much RAM because we
    //       can't add an index for every sample
    // NOTE: fields doesn't work with arrays apparently, so use map
    //       to simulate specifying fields
    console.log("fetching...");
    var expressionData = GenomicExpression.find({
      data_set_id: dataSet._id,
    }).map(function (expData) {
      return {
        feature_label: expData.feature_label,
        exp_value: expData.values[valueIndex],
      };
    });

    // sort by expression value
    expressionData.sort(function (a, b) {
      return a.exp_value < b.exp_value;
    });

    // figure out how many genes there will be
    var genesCount;
    if (args.percent_or_count === "percent") {
      genesCount = dataSet.feature_labels.length * args.top_percent / 100;
    } else {
      genesCount = args.top_count;
    }

    // remove the data we don't want
    expressionData = expressionData.slice(0, genesCount);

    // store this to be put into the gene set
    var gene_labels = [];

    // initialize the bulk insert for the records
    var bulk = Records.rawCollection().initializeUnorderedBulkOp();

    // create a record for every top gene
    console.log("inserting...");
    _.each(expressionData, function (genomicData) {
      gene_labels.push(genomicData.feature_label);

      var record = {
        "Genes": genomicData.feature_label,
        "Expression value": genomicData.exp_value,
        associated_object: {
          collection_name: "GeneSets",
          mongo_id: geneSetId,
        }
      };
      MedBook.validateRecord(record, geneSetFields);

      bulk.insert(record);
    });

    // insert all of the records and then update the gene set
    // TODO: I don't think I need the Meteor environment here
    bulk.execute(Meteor.bindEnvironment(function (error, result) {
      if (error) {
        deferred.reject(error);
      } else {
        // update the gene set so that people can see it
        // NOTE:
        GeneSets.rawCollection().update({ _id: geneSetId }, {
          $set: {
            // link it to the job so it's viewable
            associated_object: {
              collection_name: "Jobs",
              mongo_id: self.job._id,
            },

            // we can set this now that we've calculated it
            gene_labels: gene_labels,
          }
        }, errorResultResolver(deferred));
      }
    }, deferred.reject));
  }, deferred.reject));

  return deferred.promise;
};

JobClasses.RunSingleSampleTopGenes = RunSingleSampleTopGenes;
