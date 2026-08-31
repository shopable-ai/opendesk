(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const endpoint = () => `${RuntimeLive.fixture.baseURL}/echo`;

  test({ name: 'http request/get/post use the loopback fixture', tier: 'live', covers: ['http.request', 'http.get', 'http.post'] }, async () => {
    const url = endpoint();
    const requested = await http.request({ method: 'GET', url: `${url}?via=request` });
    equal(requested.status, 200);
    equal(requested.data.method, 'GET');
    assert(String(requested.data.query).includes('via=request'), JSON.stringify(requested.data));
    const got = await http.get(`${url}?via=get`);
    equal(got.data.method, 'GET');
    const posted = await http.post(url, { via: 'post' });
    equal(posted.data.method, 'POST');
    assert(JSON.stringify(posted.data.body).includes('post'), JSON.stringify(posted.data));
  });

  test({
    name: 'axios verbs preserve method and payload through http.request',
    tier: 'live',
    covers: ['axios.request', 'axios.get', 'axios.post', 'axios.put', 'axios.delete', 'axios.patch'],
  }, async () => {
    const url = endpoint();
    const responses = [
      await axios.request({ method: 'GET', url: `${url}?via=axios-request` }),
      await axios.get(`${url}?via=axios-get`),
      await axios.post(url, { via: 'axios-post' }),
      await axios.put(url, { via: 'axios-put' }),
      await axios.delete(url),
      await axios.patch(url, { via: 'axios-patch' }),
    ];
    const methods = responses.map((response) => response.data.method);
    equal(JSON.stringify(methods), JSON.stringify(['GET', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']));
    for (const response of responses) equal(response.status, 200);
  });
})();
