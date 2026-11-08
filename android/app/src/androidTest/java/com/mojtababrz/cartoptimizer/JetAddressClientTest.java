package com.mojtababrz.cartoptimizer;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.List;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class JetAddressClientTest {
    @Test public void rejectsBadCoordinatesAndRequiresExplicitServiceRange()throws Exception{
        JetAddressClient client=new JetAddressClient(path->path.startsWith("/map/search/")?"{\"status\":200,\"data\":[{\"title\":\"ونک\",\"address\":\"تهران، ونک\",\"latitude\":\"35.75\",\"longitude\":\"51.4\"},{\"address\":\"اشتباه\",\"latitude\":91,\"longitude\":51},{\"address\":\"اشتباه\",\"latitude\":\"0x23\",\"longitude\":51}]}":"{\"status\":200,\"data\":{\"address\":\"ونک\"}}");
        List<JetAddressClient.Point> points=client.search("تهران ونک");assertEquals(1,points.size());assertEquals("35.75|51.4",points.get(0).coordinates);
        try{client.verify(points.get(0));fail("Missing range must never be treated as covered");}catch(java.io.IOException expected){}
        JetAddressClient outside=new JetAddressClient(path->"{\"status\":200,\"data\":{\"is_in_service_range\":false,\"address\":\"ونک\"}}");assertFalse(outside.verify(points.get(0)).inService);
    }
    @Test public void livePublicAddressSearchAndRangeWorkWithoutGpsOrAccount()throws Exception{
        JetAddressClient client=new JetAddressClient();List<JetAddressClient.Point> points=client.search("میدان ونک");assertFalse("Jet's public address search must respond",points.isEmpty());
        JetAddressClient.Verified result=client.verify(points.get(0));assertTrue("Vanak is within Jet's service area",result.inService);assertEquals(points.get(0).coordinates,result.point.coordinates);assertTrue(result.point.label.contains("تهران"));
    }
}
