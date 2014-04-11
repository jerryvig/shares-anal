import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import org.json.JSONObject;
import org.json.JSONArray;
import static java.lang.System.out;

public class SharesAnal { 
	public static void main(String[] args) throws IOException {
		HistoryObject[] historyObjects = loadHistoryObjects("/home/superadmin/workspace/yahoo/Nasdaq100History.json");

		//println getPositiveCount(historyObjects.get(0).get("rows"));
		long t0 = System.nanoTime();
		SummaryObject summary = summarizePositivePct(historyObjects);
		long t1 = System.nanoTime();
		out.println("exec time = " + (t1-t0)/1000000.0 + " ms");
		out.println(summary.toString());
	}

	public static HistoryObject[] loadHistoryObjects(String filePath) throws IOException {
		BufferedReader historyFile = new BufferedReader(new FileReader(filePath));
		String jsonString = "{\"d\":";
		String line;

		while ((line = historyFile.readLine()) != null){
			jsonString += line;
		}

		JSONObject jsonObject = new JSONObject(jsonString+"}");
		JSONArray historyObjects = jsonObject.getJSONArray("d");

		HistoryObject[] historyObjectList = new HistoryObject[historyObjects.length()];

		for (int i=0; i<historyObjects.length(); i++){
			HistoryObject ho = new HistoryObject();
			ho.ticker = historyObjects.getJSONObject(i).getString("ticker");

			JSONArray rows = historyObjects.getJSONObject(i).getJSONArray("rows");
			ho.rows = new float[rows.length()];

			for (int j=0; j<rows.length(); j++){
				//ho.rows[j]  = new Record();
				//ho.rows[j].date = rows.getJSONObject(j).getString("d");
				ho.rows[j] = (new Double(rows.getJSONObject(j).getDouble("r"))).floatValue();
			}

			historyObjectList[i] = ho;
		}

		return historyObjectList;
	}

	public static int getHistoryLength(JSONArray hos){
		int recordCount = 0;

		for (int i=0; i<hos.length(); i++){
			JSONArray recordsArray = hos.getJSONObject(i).getJSONArray("rows");
			recordCount += recordsArray.length();
		}

		return recordCount;
	}


	public static SummaryObject getPositiveCount(float[] rows){
		SummaryObject summaryObject = new SummaryObject();
		summaryObject.positiveCount = 0;
		summaryObject.totalCount = rows.length;
		for (int i=0; i<summaryObject.totalCount; i++) {
			if (rows[i] > 0.0){
				summaryObject.positiveCount++;
			}
		}

		return summaryObject;
	}

	public static SummaryObject summarizePositivePct(HistoryObject[] historyObjects){
		SummaryObject summaryObject = new SummaryObject();
		summaryObject.positiveCount = 0;
		summaryObject.totalCount = 0;
		int len = historyObjects.length;
		for (int i=0; i<len; i++){
			SummaryObject countObj = getPositiveCount(historyObjects[i].rows);
			summaryObject.positiveCount += countObj.positiveCount;
			summaryObject.totalCount += countObj.totalCount;
		}

		summaryObject.positivePct = summaryObject.positiveCount/summaryObject.totalCount;
		return summaryObject;
	}

	private static class SummaryObject {
		public int positiveCount;
		public int totalCount;
		public float positivePct;
	}

	/* private static class Record {
		public String date;
		public float r;
	} */

	private static class HistoryObject {
		public String ticker;
		public float[] rows;
	}
}