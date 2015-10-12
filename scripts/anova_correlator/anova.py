# July2015	chrisw
# for correlator collection in workbench app...
# compute ANOVA scores for clinical_v_expression and clinical_v_signature

# imports
from optparse import OptionParser
import sys
import json
from scipy import stats
import math

# global vars


# methods and functions

def getOptions():
	"parse options"
	parser = OptionParser(usage="%prog [options]")
	parser.add_option("-v", action="store_true", default=False, dest="verbose", help="Switch for verbose mode.")
	parser.add_option("-d", action="store", default='\t', type="string", dest="delimiter", help="Output delimiter, defaults to '\t'.")
	
	parser.add_option("--clinical_study", action="store", default='', type="string", dest="clinical_study", help="clinical study")
	parser.add_option("--expression_study", action="store", default='', type="string", dest="expression_study", help="expression study")
	parser.add_option("--signature_study", action="store", default='', type="string", dest="signature_study", help="signature study")
	
	parser.add_option("--clinical", action="store", default='', type="string", dest="clinical_file", help="clinical file name")
	parser.add_option("--expression", action="store", default='', type="string", dest="expression_file", help="expression file name")
	parser.add_option("--signature", action="store", default='', type="string", dest="signature_file", help="signatures file name")
	
	parser.add_option("--expression_normalization", action="store", default='rsem_quan_log2', type="string", dest="expression_normalization", help="expression normalization")
	
	# signaturesFileFormat
	parser.add_option("--signaturesFileFormat", action="store", default='signature_scores', type="string", dest="signaturesFileFormat", help="file format of signatures file. signature_scores or cohort_signatures. default to signature_scores.")
	
 	(options, args) = parser.parse_args()

	return (options, args)

def isNumeric(obj):
	try:
		obj + 0
		return True
	except TypeError:
		return False

def log(msg, die=False):
	if (verbose | die):
		sys.stderr.write(msg)
	if die:
		sys.exit(1)

def readFileLines(filename):
	fileLines = []
	file = open(filename, 'r')
	for line in file.readlines():
# 		remove eol chars
		line = line.rstrip("\r\n")
		fileLines.append(line)
	file.close()
	return fileLines

def filterByGroupSize(groupedData, minimumSize=4):
	result = {}
	for group in groupedData:
		groupData = groupedData[group]
		if len(groupData) >= minimumSize:
			result[group] = groupData
# 		else:
# 			log('%s is too small\t%s\n' % (group, str(groupData)))
	return result

def anova_clinical_v_expression(clinicalDataSet, expressionDataSet, threshold=0.05):
	results = compute_datasets_anovas(clinicalDataSet, expressionDataSet, threshold)
	return results

def anova_clinical_v_signature(clinicalDataSet, signatureDataSet, threshold=0.05):
	results = compute_datasets_anovas(clinicalDataSet, signatureDataSet, threshold)
	return results

def compute_datasets_anovas(categoricalDataSet, continuousDataSet, threshold=0.05):
	anova_results = []
	
	categories = categoricalDataSet.keys()
	continuousDataKeys = continuousDataSet.keys()
	
	log("categories %s %s\n" % (str(len(categories)), str(categories)))
	log("continuousDataKeys %s\n" % (str(len(continuousDataKeys))))
	
 	for categoricalDataName in categories:
		categoricalData = categoricalDataSet[categoricalDataName]
		dump = True if (categoricalDataName == "Enzalutamide") else False
		dump = False
		
  		for continuousDataKey in continuousDataKeys:
#  		for continuousDataKey in ["PLK1"]:
			continuousData = continuousDataSet[continuousDataKey]
			
			groupedData = {}
 			for continuousSample in continuousData:
				if (continuousSample in categoricalData):
					categoricalVal = categoricalData[continuousSample]
					continuousVal = continuousData[continuousSample]
					
					if (categoricalVal not in groupedData):
						groupedData[categoricalVal] = []
						
					groupedData[categoricalVal].append(continuousVal)

			if dump:
				log("groupedData for %s and %s:\n" % (categoricalDataName, continuousDataKey,))
				for group in groupedData:
					size = len(groupedData[group])
					log("\t%s:%s\n" % (group, size))
				log("%s\n" % (str(groupedData)))
			results = do_anova(groupedData)
			
			if (results is None):
				continue
			
			Fval = results["F"]
			pval = results["p"]
			
			if ((math.isnan(Fval)) | (math.isnan(pval))):
				continue
				
			if ((pval == 0) | (Fval == float('Inf'))):
				continue
			
			if (pval > threshold):
				continue
			
			log10pval = -1 * math.log10(pval)
				
			resultObj = {}
			resultObj["categoricalDataName"] = categoricalDataName
			resultObj["continuousDataKey"] = continuousDataKey
			resultObj["ANOVA"] = {}
			(resultObj["ANOVA"]["F"], resultObj["ANOVA"]["p"]) = (Fval, log10pval)
			
			anova_results.append(resultObj)
	
	return anova_results

def outputANOVAresults_clin_v_expr(ANOVAresults):
	results = outputANOVAresults_clin_v_x(ANOVAresults, continuous_datatype="expression", output_type="json")
	return results

def outputANOVAresults_clin_v_sign(ANOVAresults):
	results = outputANOVAresults_clin_v_x(ANOVAresults, continuous_datatype="signature", output_type="json")
	return results

def outputANOVAresults_clin_v_x(ANOVAresults, continuous_datatype="expression", output_type="json"):
	categorical_name = "clinical"
	categorical_datatype = "clinical"
	categorical_version = 1
	
	if (output_type == "json"):
		for result in ANOVAresults:
			outputObj = {}
			
			outputObj["name_1"] = result["categoricalDataName"]
			outputObj["datatype_1"] = categorical_datatype
			outputObj["version_1"] = categorical_version
			
			if (continuous_datatype == "signature"):
				split_name = result["continuousDataKey"].split("_v")
				continuous_version = split_name.pop()
				continuous_name = "_v".join(split_name)
			elif (continuous_datatype == "expression"):
				continuous_name = result["continuousDataKey"]
				continuous_version = 1
			else:
				# meaningless vars
				continuous_name = "continuous"
				continuous_version = 1
			
			outputObj["name_2"] = continuous_name
			outputObj["datatype_2"] = continuous_datatype
			outputObj["version_2"] = continuous_version
			
			outputObj["score"] = result["ANOVA"]["p"]
			
			sys.stdout.write("%s\n" % (json.dumps(outputObj, separators=(',', ':'))))
	else:
		sys.stdout.write("%s\t%s\tF\tp\n" % (categorical_name, continuous_name))
		for result in ANOVAresults:
			sys.stdout.write("%s\t%s\t%s\t%s\n" % (str(result[categorical_name]), str(result[continuous_name]), str(result["ANOVA"]["F"]), str(result["ANOVA"]["p"])))
	
	return None

# http://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.f_oneway.html
# scipy.stats.f_oneway(*args)[source]
# returns:
# 	F-value : float
# 		The computed F-value of the test.
# 	p-value : float
# 		The associated p-value from the F-distribution.
def do_anova(groupedValuesObj):
	filteredGroups = filterByGroupSize(groupedValuesObj)
	
	# check number of groups (at least 2 needed)
	if len(filteredGroups.keys()) < 2:
		return None
	
	result = stats.f_oneway(*filteredGroups.values())
	(F, p) = result
	return {"F":F, "p":p}
	
#:####################################

def main():
	global verbose
	(options, args) = getOptions()
	verbose = options.verbose
	log('options:\t%s\n' % (str(options)))
	log('args:\t%s\n' % (str(args)))
	
	delimiter = options.delimiter
	expression_norm = options.expression_normalization

	clinicalFileLines = readFileLines(options.clinical_file)
	log("clinical lines: %s\n" % (str(len(clinicalFileLines))))
	
	old_format = True
	
	clinicalDataSet = {}
	for line in clinicalFileLines:
		# each line is a sample
		record = json.loads(line)
		if old_format:
			study = record.pop("study", None)
			sampleId = record.pop("sample", None)
		else:
			study = record.pop("Study_ID", None)
			sampleId = record.pop("Sample_ID", None)
		if (study != options.clinical_study):
			continue
		record.pop("Patient_ID", None)
		record.pop("_id", None)
		record.pop("On_Study_Date", None)
		record.pop("Off_Study_Date", None)
		for feature in record.keys():
			if (not feature in clinicalDataSet):
				clinicalDataSet[feature] = {}

			val = record[feature]
			if ((val is not None) & (str(val) != "") & (str(val) != ".")):
				clinicalDataSet[feature][sampleId] = val
	
	if (options.expression_file != ""):
		expressionFileLines = readFileLines(options.expression_file)
		log("expression lines: %s\n" % (str(len(expressionFileLines))))
		
		expressionDataSet = {}
		for line in expressionFileLines:
			# each line is a gene
			record = json.loads(line)
		
			collaborations = record.pop("Collaborations", None)
			if "WCDT" not in collaborations:
				continue

			study = record.pop("Study_ID", None)
			if (study != options.expression_study):
	#  			log("study: %s!\n" % (study))
				continue
			
			gene = record.pop("gene", None)
			if (gene not in expressionDataSet):
				expressionDataSet[gene] = {}
				
			samples = record["samples"]
			for id in samples.keys():
				val = samples[id][expression_norm]
				if ((val is not None) & (isNumeric(val))):
					expressionDataSet[gene][id] = val
					
		results_clin_v_expr = anova_clinical_v_expression(clinicalDataSet, expressionDataSet)
		
 		outputANOVAresults_clin_v_expr(results_clin_v_expr)
		
	elif (options.signature_file != ""):
		signatureFileLines = readFileLines(options.signature_file)
		log("signature lines: %s\n" % (str(len(signatureFileLines))))
		
		signaturesFileFormat = options.signaturesFileFormat
		
		# signatureDataSet[signatureLabel][patient_id] = value
		signatureDataSet = {}
		if (signaturesFileFormat == "cohort_signatures"):
			for line in signatureFileLines:
				# each line is a signature
				record = json.loads(line)
				
				# TODO does this schema record study ID?
	# 			study = record.pop("Study_ID", None)
				
				signatureLabel = record.pop("description")
				if (signatureLabel not in signatureDataSet):
					signatureDataSet[signatureLabel] = {}
				
	#  			log("%s\n" % (signatureLabel))
					
				samples = record["sample_values"]
				for i in xrange(len(samples)):
	# 				log("%s %s\n" % (signatureLabel, str(i)))
	# 				log("%s" % (str(i)))
					sampleObj = samples[i]
					patient_id = sampleObj["sample_label"]
					value = sampleObj["value"]
					
					if ((value is not None) & (isNumeric(value))):
						signatureDataSet[signatureLabel][patient_id] = value
						
	# 			log("%s has %s samples.\n" % (signatureLabel, str(signatureDataSet)))
		elif (signaturesFileFormat == "signature_scores"):
			for line in signatureFileLines:
				# each line is a sample score
				record = json.loads(line)
				
				signatureName = record.pop("name")
				value = record.pop("val")
				sampleId = record.pop("id")
				if (signatureName not in signatureDataSet):
					signatureDataSet[signatureName] = {}
					
				if ((value is not None) & (isNumeric(value))):
					signatureDataSet[signatureName][sampleId] = value

		# compute anova					
		results_clin_v_sign = anova_clinical_v_signature(clinicalDataSet, signatureDataSet, threshold=0.05)
		
 		outputANOVAresults_clin_v_sign(results_clin_v_sign)

# main program section
if __name__ == "__main__":
	main()
